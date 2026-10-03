import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, CompetitionFormat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import {
  DivisionFixtureStatusDto,
  FixturePageDto,
  FixturePageQueryDto,
  FixtureScheduleValidationDto,
  ScheduleFixtureDto,
  SeasonFixtureStatusDto,
} from './fixture.dto.js';
import { eligiblePlayerProfileWhere } from '../participation/eligibility.js';
import {
  expectedRoundRobinFixtureCount,
  expectedRoundRobinRoundCount,
  MAX_FIXTURES_PER_GENERATION,
  resolveCompetitionParticipantCount,
  selectCompetitionParticipants,
} from '../season/competition-field.js';

export interface ScheduleActor {
  id?: string;
  role?: string;
  correlationId?: string;
}

interface Pairing {
  homePlayerId: string;
  awayPlayerId: string;
  round: number;
  leg: 1 | 2;
}

interface DistributedPairing extends Pairing {
  schedulingPeriod: number;
  concurrencySlot: number;
}

interface ScheduleFixtureRecord {
  id: string;
  schedule_key: string | null;
  fixture_number: number | null;
  scheduling_period_number: number | null;
  concurrency_slot: number | null;
  match_week: { week_number: number } | null;
  home_player_id: string;
  away_player_id: string;
  scheduled_at?: Date | null;
  scheduled_timezone?: string | null;
  check_in_opens_at?: Date | null;
  check_in_closes_at?: Date | null;
  play_window_opens_at?: Date | null;
  play_window_closes_at?: Date | null;
  scheduling_status?: string;
  status?: string;
  match: { id: string; status?: string } | null;
}

@Injectable()
export class FixtureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async generateDivisionSchedule(
    seasonId: string,
    divisionId: string,
    actor?: ScheduleActor,
  ) {
    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.findUnique({ where: { id: seasonId } });
      if (!season) throw new NotFoundException('Season not found');
      if (season.status !== 'ROSTER_LOCKED') {
        throw new BadRequestException(`Fixtures can only be generated when the season is ROSTER_LOCKED (current status: ${season.status})`);
      }

      const division = await tx.division.findUnique({ where: { id: divisionId } });
      if (!division || division.season_id !== seasonId) {
        throw new NotFoundException('Division not found in this season');
      }
      if (!division.active) {
        throw new BadRequestException(`Division "${division.name}" is inactive and cannot generate fixtures`);
      }

      const participants = await tx.divisionParticipant.findMany({
        where: {
          season_id: seasonId,
          division_id: divisionId,
          status: 'ACTIVE',
          player: { is: eligiblePlayerProfileWhere },
        },
        select: { player_id: true, seed: true, registered_at: true },
      });

      if (participants.length < 2) {
        throw new BadRequestException(`Division "${division.name}" needs at least two eligible active participants; found ${participants.length}`);
      }

      const competitionCount = resolveCompetitionParticipantCount(division, participants.length);
      if (competitionCount < 2) {
        throw new BadRequestException(`Division "${division.name}" must have a competition field of at least two participants`);
      }
      if (competitionCount > participants.length) {
        throw new BadRequestException(`Division "${division.name}" requires ${competitionCount} eligible participants for its configured competition field; found ${participants.length}`);
      }
      if (division.capacity !== null && competitionCount > division.capacity) {
        throw new BadRequestException(`Division "${division.name}" competition field cannot exceed its capacity of ${division.capacity}`);
      }
      const expectedFixtureCount = expectedRoundRobinFixtureCount(competitionCount, division.format);
      if (expectedFixtureCount > MAX_FIXTURES_PER_GENERATION) {
        throw new BadRequestException(
          `The ${competitionCount}-participant ${division.format} field requires ${expectedFixtureCount} fixtures ` +
          `(approximately ${expectedFixtureCount * 3} awaited writes); the per-transaction generation limit is ` +
          `${MAX_FIXTURES_PER_GENERATION}. Reduce the competition field or use a staged generation workflow.`,
        );
      }

      const selectedParticipants = selectCompetitionParticipants(participants, competitionCount);
      await tx.divisionParticipant.updateMany({
        where: { season_id: seasonId, division_id: divisionId },
        data: { competition_selected: false },
      });
      await tx.divisionParticipant.updateMany({
        where: {
          season_id: seasonId,
          division_id: divisionId,
          player_id: { in: selectedParticipants.map(({ player_id }) => player_id) },
        },
        data: { competition_selected: true },
      });

      const pairings = buildRoundRobin(selectedParticipants.map((p) => p.player_id), division.format);
      const rounds = expectedRoundRobinRoundCount(selectedParticipants.length, division.format);
      const distributedPairings = distributeFixtures(
        pairings,
        division.matches_per_participant,
        division.concurrent_matches,
      );

      const existingFixtureCount = await tx.fixture.count({ where: { division_id: divisionId } });
      if (existingFixtureCount > MAX_FIXTURES_PER_GENERATION) {
        throw new BadRequestException(
          `Division already has ${existingFixtureCount} fixtures, which exceeds the inline validation limit of ${MAX_FIXTURES_PER_GENERATION}.`,
        );
      }
      const existingFixtures: ScheduleFixtureRecord[] = existingFixtureCount
        ? await tx.fixture.findMany({
            where: { division_id: divisionId },
            select: {
              id: true,
              schedule_key: true,
              fixture_number: true,
              scheduling_period_number: true,
              concurrency_slot: true,
              match_week: { select: { week_number: true } },
              home_player_id: true,
              away_player_id: true,
              match: { select: { id: true } },
            },
          })
        : [];

      if (existingFixtures.length) {
        const validation = validateGeneratedSchedule(
          distributedPairings,
          existingFixtures,
          selectedParticipants.map(({ player_id }) => player_id),
          division.format,
          division.matches_per_participant,
          division.concurrent_matches,
        );
        if (validation.valid) {
          return {
            seasonId,
            divisionId,
            format: division.format,
            status: 'ALREADY_GENERATED',
            participantCount: selectedParticipants.length,
            roundCount: rounds,
            schedulingPeriodCount: Math.ceil(rounds / division.matches_per_participant),
            expectedFixtureCount: pairings.length,
            fixtureCount: existingFixtures.length,
            validation,
            warnings: validation.densityWarnings,
          };
        }
        throw new BadRequestException(
          `Existing fixtures failed schedule validation: ${validation.errors.join(' ')}`,
        );
      }

      await ensureMatchWeeks(tx, seasonId, divisionId, rounds);

      const weeks = await tx.matchWeek.findMany({
        where: { season_id: seasonId, division_id: divisionId },
        orderBy: { week_number: 'asc' },
      });
      const weekByRound = new Map(weeks.map((week) => [week.week_number, week]));

      const persistedFixtures: ScheduleFixtureRecord[] = [];
      for (const [index, pairing] of distributedPairings.entries()) {
        const week = weekByRound.get(pairing.round);
        if (!week) throw new Error(`Match week ${pairing.round} was not created`);

        const [first, second] = [pairing.homePlayerId, pairing.awayPlayerId].sort();
        const scheduleKey = `${first}:${second}:${pairing.leg}`;

        const fixture = await tx.fixture.create({
          data: {
            division_id: divisionId,
            match_week_id: week.id,
            fixture_number: index + 1,
            scheduling_period_number: pairing.schedulingPeriod,
            concurrency_slot: pairing.concurrencySlot,
            home_player_id: pairing.homePlayerId,
            away_player_id: pairing.awayPlayerId,
            schedule_key: scheduleKey,
            status: 'SCHEDULED',
          },
        });

        const match = await tx.match.create({
          data: {
            fixture_id: fixture.id,
            season_id: seasonId,
            division_id: divisionId,
            status: 'SCHEDULED',
          },
        });

        await tx.matchParticipant.createMany({
          data: [
            { match_id: match.id, player_id: pairing.homePlayerId, role: 'HOME' },
            { match_id: match.id, player_id: pairing.awayPlayerId, role: 'AWAY' },
          ],
        });

        persistedFixtures.push({
          id: fixture.id,
          schedule_key: scheduleKey,
          fixture_number: index + 1,
          scheduling_period_number: pairing.schedulingPeriod,
          concurrency_slot: pairing.concurrencySlot,
          match_week: { week_number: pairing.round },
          home_player_id: pairing.homePlayerId,
          away_player_id: pairing.awayPlayerId,
          match: { id: match.id },
        });
      }

      const validation = validateGeneratedSchedule(
        distributedPairings,
        persistedFixtures,
        selectedParticipants.map(({ player_id }) => player_id),
        division.format,
        division.matches_per_participant,
        division.concurrent_matches,
      );
      if (!validation.valid) {
        throw new BadRequestException(`Generated schedule failed validation: ${validation.errors.join(' ')}`);
      }

      await this.outbox.enqueueEvent(tx, {
        eventName: 'division.fixtures_generated',
        aggregateType: 'Division',
        aggregateId: divisionId,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId,
        metadata: {
          seasonId,
          divisionId,
          format: division.format,
          participantCount: selectedParticipants.length,
          roundCount: rounds,
          schedulingPeriodCount: Math.ceil(rounds / division.matches_per_participant),
          fixtureCount: pairings.length,
          densityWarnings: validation.densityWarnings,
        },
      });

      return {
        seasonId,
        divisionId,
        format: division.format,
        status: 'GENERATED',
        participantCount: selectedParticipants.length,
        roundCount: rounds,
        schedulingPeriodCount: Math.ceil(rounds / division.matches_per_participant),
        expectedFixtureCount: pairings.length,
        fixtureCount: pairings.length,
        validation,
        warnings: validation.densityWarnings,
      };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isRetryableScheduleConflict(error)) {
        const status = await this.getDivisionScheduleStatus(seasonId, divisionId);
        if (status.generationStatus === 'GENERATED') {
          return {
            seasonId,
            divisionId,
            format: status.format,
            status: 'ALREADY_GENERATED',
            participantCount: status.participantCount,
            roundCount: status.roundCount,
            schedulingPeriodCount: status.schedulingPeriodCount,
            expectedFixtureCount: status.expectedFixtureCount,
            fixtureCount: status.currentFixtureCount,
            validation: status.validation,
            warnings: status.validation?.densityWarnings ?? [],
          };
        }
      }
      throw error;
    }
  }

  async getSeasonScheduleStatus(seasonId: string): Promise<SeasonFixtureStatusDto> {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      select: {
        id: true,
        name: true,
        status: true,
        league: { select: { name: true } },
      },
    });
    if (!season) throw new NotFoundException('Season not found');

    const divisions = await this.prisma.division.findMany({
      where: { season_id: seasonId },
      select: { id: true },
      orderBy: { name: 'asc' },
    });

    return {
      seasonId,
      seasonName: season.name,
      leagueName: season.league.name,
      seasonStatus: season.status,
      divisions: await Promise.all(divisions.map(({ id }) => this.getDivisionScheduleStatus(seasonId, id))),
    };
  }

  async getDivisionFixtures(
    seasonId: string,
    divisionId: string,
    query: FixturePageQueryDto,
  ): Promise<FixturePageDto> {
    const division = await this.prisma.division.findFirst({
      where: { id: divisionId, season_id: seasonId },
      select: { id: true, schedule_locked: true },
    });
    if (!division) throw new NotFoundException('Division not found in this season');

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 25));
    const where = { division_id: divisionId };
    const [total, fixtures] = await Promise.all([
      this.prisma.fixture.count({ where }),
      this.prisma.fixture.findMany({
        where,
        orderBy: [{ fixture_number: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fixture_number: true,
          scheduled_at: true,
          scheduled_timezone: true,
          check_in_opens_at: true,
          check_in_closes_at: true,
          play_window_opens_at: true,
          play_window_closes_at: true,
          scheduling_status: true,
          status: true,
          scheduling_period_number: true,
          match_week: { select: { week_number: true } },
          home_player: { select: { id: true, gamer_tag: true } },
          away_player: { select: { id: true, gamer_tag: true } },
          match: { select: { status: true } },
        },
      }),
    ]);

    return {
      divisionId,
      scheduleLocked: division.schedule_locked,
      fixtures: fixtures.map((fixture) => ({
  id: fixture.id,
  fixtureNumber: fixture.fixture_number,
  scheduledAt: fixture.scheduled_at?.toISOString() ?? null,
  timezone: fixture.scheduled_timezone,
  checkInOpensAt: fixture.check_in_opens_at?.toISOString() ?? null,
  checkInClosesAt: fixture.check_in_closes_at?.toISOString() ?? null,
  playWindowOpensAt: fixture.play_window_opens_at?.toISOString() ?? null,
  playWindowClosesAt: fixture.play_window_closes_at?.toISOString() ?? null,
  schedulingStatus: fixture.scheduling_status,
  status: fixture.status,
  roundNumber: fixture.match_week?.week_number ?? null,
  schedulingPeriodNumber: fixture.scheduling_period_number,
  homePlayer: {
    id: fixture.home_player.id,
    gamerTag: fixture.home_player.gamer_tag,
  },
  awayPlayer: {
    id: fixture.away_player.id,
    gamerTag: fixture.away_player.gamer_tag,
  },
  matchStatus: fixture.match?.status ?? null,
})),
  
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async scheduleFixture(
    seasonId: string,
    divisionId: string,
    fixtureId: string,
    dto: ScheduleFixtureDto,
    actor?: ScheduleActor,
  ) {
    const scheduledAt = parseZonedInstant(dto.scheduledAt, 'Scheduled time');
    const checkInOpensAt = parseZonedInstant(dto.checkInOpensAt, 'Check-in open time');
    const checkInClosesAt = parseZonedInstant(dto.checkInClosesAt, 'Check-in close time');
    const playWindowOpensAt = parseZonedInstant(dto.playWindowOpensAt, 'Play-window open time');
    const playWindowClosesAt = parseZonedInstant(dto.playWindowClosesAt, 'Play-window close time');
    assertIanaTimezone(dto.timezone);
    if (!(checkInOpensAt < checkInClosesAt &&
      checkInClosesAt <= playWindowOpensAt &&
      playWindowOpensAt <= scheduledAt &&
      scheduledAt <= playWindowClosesAt)) {
      throw new BadRequestException('Scheduling windows must follow check-in open → check-in close → play-window open → scheduled time → play-window close');
    }
    if (checkInOpensAt.getTime() <= Date.now()) {
      throw new BadRequestException('Scheduling a fixture with a check-in window in the past is not allowed');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.findUnique({ where: { id: seasonId }, select: { id: true, status: true } });
      if (!season) throw new NotFoundException('Season not found');
      if (season.status !== 'ROSTER_LOCKED') {
        throw new BadRequestException('Fixtures can only be scheduled before the season is activated');
      }

      const division = await tx.division.findFirst({
        where: { id: divisionId, season_id: seasonId },
      });
      if (!division) throw new NotFoundException('Division not found in this season');
      if (division.schedule_locked) throw new BadRequestException('The division schedule is locked');
      if (dto.timezone !== division.match_window_timezone) {
        throw new BadRequestException(`Fixture timezone must match the division timezone ${division.match_window_timezone}`);
      }

      const fixture = await tx.fixture.findFirst({
        where: { id: fixtureId, division_id: divisionId },
        include: { match: true, match_week: true },
      });
      if (!fixture) throw new NotFoundException('Fixture not found in this division');
      if (!fixture.match || fixture.match.status !== 'SCHEDULED') {
        throw new BadRequestException('A fixture cannot be scheduled or rescheduled after match execution begins');
      }
      if (!fixture.match_week) throw new BadRequestException('Fixture must belong to a configured competition round before scheduling');
      validateAppointmentWithinDivisionWindow(scheduledAt, dto.timezone, division);
      if (fixture.match_week.start_date && checkInOpensAt < fixture.match_week.start_date) {
        throw new BadRequestException('Check-in window opens before the configured round window');
      }
      if (fixture.match_week.end_date && playWindowClosesAt > fixture.match_week.end_date) {
        throw new BadRequestException('Play window closes after the configured round window');
      }
      if (
        fixture.scheduled_at?.getTime() === scheduledAt.getTime() &&
        fixture.scheduled_timezone === dto.timezone &&
        fixture.check_in_opens_at?.getTime() === checkInOpensAt.getTime() &&
        fixture.check_in_closes_at?.getTime() === checkInClosesAt.getTime() &&
        fixture.play_window_opens_at?.getTime() === playWindowOpensAt.getTime() &&
        fixture.play_window_closes_at?.getTime() === playWindowClosesAt.getTime()
      ) {
        return fixture;
      }

      const simultaneousFixtures = await tx.fixture.findMany({
        where: {
          division_id: divisionId,
          id: { not: fixtureId },
          match: { is: { status: { notIn: ['VOID', 'ARCHIVED', 'FORFEITED'] } } },
          OR: [
            {
              check_in_opens_at: { lt: playWindowClosesAt },
              play_window_closes_at: { gt: checkInOpensAt },
            },
            {
              check_in_opens_at: null,
              scheduled_at: { gte: checkInOpensAt, lt: playWindowClosesAt },
            },
          ],
        },
        select: { id: true, home_player_id: true, away_player_id: true },
      });
      const conflictingPlayerFixture = simultaneousFixtures.find((other) =>
        [other.home_player_id, other.away_player_id].some((playerId) =>
          playerId === fixture.home_player_id || playerId === fixture.away_player_id,
        ),
      );
      if (conflictingPlayerFixture) {
        throw new BadRequestException('A participant already has a fixture scheduled at this time');
      }
      if (simultaneousFixtures.length >= division.concurrent_matches) {
        throw new BadRequestException(`This time already uses the configured concurrency capacity of ${division.concurrent_matches}`);
      }

      const updated = await tx.fixture.update({
        where: { id: fixtureId },
        data: {
          scheduled_at: scheduledAt,
          scheduled_timezone: dto.timezone,
          check_in_opens_at: checkInOpensAt,
          check_in_closes_at: checkInClosesAt,
          play_window_opens_at: playWindowOpensAt,
          play_window_closes_at: playWindowClosesAt,
          scheduling_status: fixture.scheduled_at ? 'RESCHEDULED' : 'SCHEDULED',
        },
      });
      await this.outbox.enqueueEvent(tx, {
        eventName: fixture.scheduled_at ? 'fixture.rescheduled' : 'fixture.scheduled',
        aggregateType: 'Fixture',
        aggregateId: fixture.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId,
        metadata: {
          seasonId,
          divisionId,
          before: {
            scheduledAt: fixture.scheduled_at,
            timezone: fixture.scheduled_timezone,
            checkInOpensAt: fixture.check_in_opens_at,
            checkInClosesAt: fixture.check_in_closes_at,
            playWindowOpensAt: fixture.play_window_opens_at,
            playWindowClosesAt: fixture.play_window_closes_at,
          },
          after: {
            scheduledAt,
            timezone: dto.timezone,
            checkInOpensAt,
            checkInClosesAt,
            playWindowOpensAt,
            playWindowClosesAt,
          },
        },
      });
      return updated;
    });
  }

  async lockDivisionSchedule(seasonId: string, divisionId: string, actor?: ScheduleActor) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.findUnique({ where: { id: seasonId }, select: { id: true, status: true } });
      if (!season) throw new NotFoundException('Season not found');
      if (season.status !== 'ROSTER_LOCKED') {
        throw new BadRequestException('A schedule can only be locked while the season roster is locked');
      }

      const division = await tx.division.findFirst({ where: { id: divisionId, season_id: seasonId } });
      if (!division || !division.active) throw new NotFoundException('Active division not found in this season');
      if (division.schedule_locked) return { seasonId, divisionId, scheduleLocked: true };

      const participants = await tx.divisionParticipant.findMany({
        where: {
          season_id: seasonId,
          division_id: divisionId,
          status: 'ACTIVE',
          competition_selected: true,
          player: { is: eligiblePlayerProfileWhere },
        },
        select: { player_id: true, seed: true, registered_at: true },
      });
      const competitionCount = resolveCompetitionParticipantCount(division, participants.length);
      if (competitionCount < 2 || competitionCount > participants.length ||
        (division.capacity !== null && competitionCount > division.capacity)) {
        throw new BadRequestException('The selected competition field is invalid and cannot be locked');
      }
      if (participants.length !== competitionCount) {
        throw new BadRequestException(`The schedule requires exactly ${competitionCount} selected competition participants`);
      }

      const expectedFixtureCount = expectedRoundRobinFixtureCount(competitionCount, division.format);
      if (expectedFixtureCount > MAX_FIXTURES_PER_GENERATION) {
        throw new BadRequestException(`The requested schedule exceeds the ${MAX_FIXTURES_PER_GENERATION}-fixture lock-validation limit`);
      }
      const selectedParticipants = selectCompetitionParticipants(participants, competitionCount);
      const selectedIds = selectedParticipants.map(({ player_id }) => player_id);
      if (participants.some(({ player_id }) => !selectedIds.includes(player_id))) {
        throw new BadRequestException('Selected participants do not match the deterministic competition field');
      }

      const expectedPairings = distributeFixtures(
        buildRoundRobin(selectedIds, division.format),
        division.matches_per_participant,
        division.concurrent_matches,
      );
      const fixtures: ScheduleFixtureRecord[] = await tx.fixture.findMany({
        where: { division_id: divisionId },
        select: {
          id: true,
          schedule_key: true,
          fixture_number: true,
          scheduling_period_number: true,
          concurrency_slot: true,
          scheduled_at: true,
          scheduled_timezone: true,
          check_in_opens_at: true,
          check_in_closes_at: true,
          play_window_opens_at: true,
          play_window_closes_at: true,
          scheduling_status: true,
          status: true,
          match_week: { select: { week_number: true } },
          home_player_id: true,
          away_player_id: true,
          match: { select: { id: true, status: true } },
        },
      });
      const validation = validateGeneratedSchedule(
        expectedPairings,
        fixtures,
        selectedIds,
        division.format,
        division.matches_per_participant,
        division.concurrent_matches,
      );
      if (!validation.valid) {
        throw new BadRequestException(`Schedule failed validation and cannot be locked: ${validation.errors.join(' ')}`);
      }
      if (fixtures.some(({ scheduled_at }) => !scheduled_at)) {
        throw new BadRequestException('Every fixture must be scheduled before the schedule can be locked');
      }
      if (fixtures.some(({ match }) => !match || match.status !== 'SCHEDULED')) {
        throw new BadRequestException('A schedule cannot be locked after any fixture match has entered execution');
      }
      if (fixtures.some((fixture) =>
        !fixture.scheduled_timezone ||
        !fixture.check_in_opens_at ||
        !fixture.check_in_closes_at ||
        !fixture.play_window_opens_at ||
        !fixture.play_window_closes_at
      )) {
        throw new BadRequestException('Every fixture must have a timezone, check-in period, and play window before locking');
      }
      const conflicts = countScheduleConflicts(fixtures, division.concurrent_matches);
      if (conflicts > 0) throw new BadRequestException(`Resolve ${conflicts} scheduling conflict(s) before locking the schedule`);

      await tx.division.update({ where: { id: divisionId }, data: { schedule_locked: true } });
      await this.outbox.enqueueEvent(tx, {
        eventName: 'division.schedule_locked',
        aggregateType: 'Division',
        aggregateId: divisionId,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId,
        metadata: { seasonId, divisionId, fixtureCount: fixtures.length },
      });
      return { seasonId, divisionId, scheduleLocked: true, fixtureCount: fixtures.length };
    });
  }

  async getDivisionScheduleStatus(seasonId: string, divisionId: string): Promise<DivisionFixtureStatusDto> {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId }, select: { id: true, status: true } });
    if (!season) throw new NotFoundException('Season not found');

    const division = await this.prisma.division.findUnique({ where: { id: divisionId } });
    if (!division || division.season_id !== seasonId) throw new NotFoundException('Division not found in this season');

    const participants = await this.prisma.divisionParticipant.findMany({
      where: {
        season_id: seasonId,
        division_id: divisionId,
        status: 'ACTIVE',
        player: { is: eligiblePlayerProfileWhere },
      },
      select: { player_id: true, seed: true, registered_at: true },
    });
    const competitionCount = resolveCompetitionParticipantCount(division, participants.length);
    const expectedFixtureCount = competitionCount >= 2
      ? expectedRoundRobinFixtureCount(competitionCount, division.format)
      : 0;
    const roundCount = competitionCount >= 2
      ? expectedRoundRobinRoundCount(competitionCount, division.format)
      : 0;
    const fieldIsEligible = competitionCount <= participants.length;
    const canBuildPairings = competitionCount >= 2 && fieldIsEligible && expectedFixtureCount <= MAX_FIXTURES_PER_GENERATION;
    const selectedParticipants = canBuildPairings
      ? selectCompetitionParticipants(participants, competitionCount)
      : [];
    const pairings = canBuildPairings
      ? buildRoundRobin(selectedParticipants.map(({ player_id }) => player_id), division.format)
      : [];
    const distributedPairings = distributeFixtures(
      pairings,
      division.matches_per_participant,
      division.concurrent_matches,
    );
    const currentFixtureCount = await this.prisma.fixture.count({ where: { division_id: divisionId } });
    const scheduledFixtureCount = await this.prisma.fixture.count({
      where: { division_id: divisionId, scheduled_at: { not: null } },
    });
    const canLoadFixtures = currentFixtureCount > 0 &&
      currentFixtureCount <= MAX_FIXTURES_PER_GENERATION &&
      expectedFixtureCount <= MAX_FIXTURES_PER_GENERATION &&
      canBuildPairings;
    const fixtures: ScheduleFixtureRecord[] = canLoadFixtures
      ? await this.prisma.fixture.findMany({
          where: { division_id: divisionId },
          select: {
            id: true,
            schedule_key: true,
            fixture_number: true,
            scheduling_period_number: true,
            concurrency_slot: true,
            scheduled_at: true,
            scheduled_timezone: true,
            check_in_opens_at: true,
            check_in_closes_at: true,
            play_window_opens_at: true,
            play_window_closes_at: true,
            scheduling_status: true,
            status: true,
            match_week: { select: { week_number: true } },
            home_player_id: true,
            away_player_id: true,
            match: { select: { id: true, status: true } },
          },
        })
      : [];

    const blockers: string[] = [];
    const warnings: string[] = [];
    if (season.status !== 'ROSTER_LOCKED') blockers.push(`Season must be ROSTER_LOCKED to generate fixtures (current status: ${season.status}).`);
    if (!division.active) blockers.push('Division is inactive.');
    if (participants.length < 2) blockers.push(`At least two eligible active participants are required; found ${participants.length}.`);
    if (competitionCount < 2) blockers.push('The configured competition field must contain at least two participants.');
    if (competitionCount > participants.length) blockers.push(`The configured competition field requires ${competitionCount} eligible participants; found ${participants.length}.`);
    if (division.capacity !== null && competitionCount > division.capacity) blockers.push(`The configured competition field exceeds the division capacity of ${division.capacity}.`);
    if (expectedFixtureCount > MAX_FIXTURES_PER_GENERATION) {
      blockers.push(
        `The configured field requires ${expectedFixtureCount} fixtures, above the per-transaction generation limit of ${MAX_FIXTURES_PER_GENERATION}. Reduce the competition field or use a staged generation workflow.`,
      );
    }
    if (currentFixtureCount > MAX_FIXTURES_PER_GENERATION) {
      blockers.push(`The existing ${currentFixtureCount}-fixture schedule exceeds the inline validation limit of ${MAX_FIXTURES_PER_GENERATION}.`);
    }
    const conflictCount = currentFixtureCount === 0
      ? 0
      : canLoadFixtures
        ? countScheduleConflicts(fixtures, division.concurrent_matches)
        : null;
    if (conflictCount === null) warnings.push('Scheduling conflicts were not enumerated because this schedule exceeds inline validation limits.');
    if (conflictCount !== null && conflictCount > 0) warnings.push(`${conflictCount} scheduling conflict(s) need resolution.`);
    const validation = fixtures.length
      ? validateGeneratedSchedule(
          distributedPairings,
          fixtures,
          selectedParticipants.map(({ player_id }) => player_id),
          division.format,
          division.matches_per_participant,
          division.concurrent_matches,
        )
      : null;
    if (validation && !validation.valid) {
      blockers.push(...validation.errors);
    }
    if (validation) warnings.push(...validation.densityWarnings);

    const generationStatus = currentFixtureCount > 0
      ? validation?.valid ? 'GENERATED' : 'INCOMPLETE'
      : blockers.length ? 'BLOCKED' : 'NOT_GENERATED';
    if (generationStatus === 'GENERATED' && season.status !== 'ROSTER_LOCKED') {
      warnings.push('The schedule exists; further fixture generation is disabled outside ROSTER_LOCKED.');
    }

    return {
      divisionId,
      divisionName: division.name,
      active: division.active,
      format: division.format,
      registrationCapacity: division.registration_capacity,
      competitionCapacity: division.capacity,
      configuredCompetitionParticipantCount: division.competition_participant_count,
      schedulingPeriodDays: division.scheduling_period_days,
      matchesPerParticipant: division.matches_per_participant,
      matchWindowStartMinutes: division.match_window_start_minutes,
      matchWindowEndMinutes: division.match_window_end_minutes,
      matchWindowTimezone: division.match_window_timezone,
      concurrentMatches: division.concurrent_matches,
      registrationCount: await this.prisma.divisionParticipant.count({ where: { season_id: seasonId, division_id: divisionId } }),
      participantCount: fieldIsEligible ? competitionCount : participants.length,
      expectedFixtureCount,
      currentFixtureCount,
      scheduledFixtureCount,
      unscheduledFixtureCount: currentFixtureCount - scheduledFixtureCount,
      roundCount,
      schedulingPeriodCount: roundCount ? Math.ceil(roundCount / division.matches_per_participant) : 0,
      currentRound: getCurrentRound(fixtures),
      conflictCount,
      scheduleLocked: division.schedule_locked,
      generationStatus,
      validation,
      blockers,
      warnings,
    };
  }
}

export function distributeFixtures(
  pairings: Pairing[],
  matchesPerParticipant: number,
  concurrentMatches: number,
): DistributedPairing[] {
  if (!Number.isInteger(matchesPerParticipant) || matchesPerParticipant < 1) {
    throw new BadRequestException('Matches per participant target must be at least one');
  }
  if (!Number.isInteger(concurrentMatches) || concurrentMatches < 1) {
    throw new BadRequestException('Concurrent matches must be at least one');
  }

  const fixturesPerRound = new Map<number, number>();
  for (const pairing of pairings) {
    fixturesPerRound.set(pairing.round, (fixturesPerRound.get(pairing.round) ?? 0) + 1);
  }
  const batchesPerRound = Math.max(
    1,
    ...[...fixturesPerRound.values()].map((count) => Math.ceil(count / concurrentMatches)),
  );
  const fixtureIndexByRound = new Map<number, number>();

  return pairings.map((pairing) => {
    const schedulingPeriod = Math.floor((pairing.round - 1) / matchesPerParticipant) + 1;
    const roundOffset = (pairing.round - 1) % matchesPerParticipant;
    const fixtureIndexInRound = fixtureIndexByRound.get(pairing.round) ?? 0;
    fixtureIndexByRound.set(pairing.round, fixtureIndexInRound + 1);
    const concurrencySlot =
      roundOffset * batchesPerRound + Math.floor(fixtureIndexInRound / concurrentMatches) + 1;
    return { ...pairing, schedulingPeriod, concurrencySlot };
  });
}

function scheduleKey(pairing: Pairing) {
  const [first, second] = [pairing.homePlayerId, pairing.awayPlayerId].sort();
  return `${first}:${second}:${pairing.leg}`;
}

export function validateGeneratedSchedule(
  pairings: DistributedPairing[],
  fixtures: ScheduleFixtureRecord[],
  participantIds: string[],
  format: CompetitionFormat,
  matchesPerParticipant: number,
  concurrentMatches: number,
): FixtureScheduleValidationDto {
  const errors: string[] = [];
  const densityWarnings: string[] = [];
  const expectedFixtureCount = expectedRoundRobinFixtureCount(participantIds.length, format);
  if (participantIds.length < 2) errors.push('The competition field must contain at least two participants.');
  if (pairings.length !== expectedFixtureCount) {
    errors.push(`Expected ${expectedFixtureCount} fixtures for ${format}; generated ${pairings.length}.`);
  }
  if (fixtures.length !== expectedFixtureCount) {
    errors.push(`Expected ${expectedFixtureCount} persisted fixtures; found ${fixtures.length}.`);
  }
  if (!Number.isInteger(matchesPerParticipant) || matchesPerParticipant < 1) {
    errors.push('The matches-per-participant density target must be at least one.');
  }
  if (!Number.isInteger(concurrentMatches) || concurrentMatches < 1) {
    errors.push('Concurrent match capacity must be at least one.');
  }

  const participantSet = new Set(participantIds);
  const expectedByKey = new Map(pairings.map((pairing, index) => [scheduleKey(pairing), { pairing, index }]));
  if (expectedByKey.size !== pairings.length) errors.push('The generated pairings contain duplicate participant legs.');

  const fixtureByKey = new Map<string, ScheduleFixtureRecord>();
  const participantCounts = new Map(participantIds.map((id) => [id, 0]));
  const periodCounts = new Map<number, number>();
  const participantPeriodCounts = new Map<string, number>();
  const slotCounts = new Map<string, number>();
  const slotParticipants = new Map<string, Set<string>>();

  for (const fixture of fixtures) {
    if (!fixture.id || !fixture.match?.id) errors.push('A fixture is missing its persisted fixture or match reference.');
    if (!fixture.schedule_key) {
      errors.push(`Fixture ${fixture.id || '(unknown)'} is missing its pairing key.`);
    } else if (fixtureByKey.has(fixture.schedule_key)) {
      errors.push(`Duplicate fixture pairing for leg ${fixture.schedule_key}.`);
    } else {
      fixtureByKey.set(fixture.schedule_key, fixture);
    }

    if (fixture.home_player_id === fixture.away_player_id) {
      errors.push(`Fixture ${fixture.id || '(unknown)'} pairs a participant against themselves.`);
    }
    if (!participantSet.has(fixture.home_player_id) || !participantSet.has(fixture.away_player_id)) {
      errors.push(`Fixture ${fixture.id || '(unknown)'} includes a participant outside the selected competition field.`);
    }
    if (!fixture.match_week) errors.push(`Fixture ${fixture.id || '(unknown)'} has no competition round assignment.`);
    if (fixture.scheduling_period_number === null || fixture.scheduling_period_number < 1) {
      errors.push(`Fixture ${fixture.id || '(unknown)'} has an invalid scheduling period.`);
    }
    if (fixture.concurrency_slot === null || fixture.concurrency_slot < 1) {
      errors.push(`Fixture ${fixture.id || '(unknown)'} has an invalid concurrency slot.`);
    }

    if (!fixture.schedule_key) continue;
    const expected = expectedByKey.get(fixture.schedule_key);
    if (!expected) {
      errors.push(`Fixture ${fixture.id || '(unknown)'} does not match a valid participant pairing and leg.`);
    } else {
      if (fixture.fixture_number !== expected.index + 1) {
        errors.push(`Fixture ${fixture.id} has an invalid fixture number.`);
      }
      if (fixture.home_player_id !== expected.pairing.homePlayerId || fixture.away_player_id !== expected.pairing.awayPlayerId) {
        errors.push(`Fixture ${fixture.id} has an invalid participant pairing for its leg.`);
      }
      if (fixture.match_week?.week_number !== expected.pairing.round) {
        errors.push(`Fixture ${fixture.id} is assigned to the wrong competition round.`);
      }
    }

    participantCounts.set(fixture.home_player_id, (participantCounts.get(fixture.home_player_id) ?? 0) + 1);
    participantCounts.set(fixture.away_player_id, (participantCounts.get(fixture.away_player_id) ?? 0) + 1);
    if (fixture.scheduling_period_number !== null && fixture.scheduling_period_number > 0) {
      const period = fixture.scheduling_period_number;
      periodCounts.set(period, (periodCounts.get(period) ?? 0) + 1);
      for (const playerId of [fixture.home_player_id, fixture.away_player_id]) {
        const key = `${playerId}:${period}`;
        participantPeriodCounts.set(key, (participantPeriodCounts.get(key) ?? 0) + 1);
      }
      if (fixture.concurrency_slot !== null && fixture.concurrency_slot > 0) {
        const slotKey = `${period}:${fixture.concurrency_slot}`;
        slotCounts.set(slotKey, (slotCounts.get(slotKey) ?? 0) + 1);
        const players = slotParticipants.get(slotKey) ?? new Set<string>();
        players.add(fixture.home_player_id);
        players.add(fixture.away_player_id);
        slotParticipants.set(slotKey, players);
      }
    }
  }

  if (fixtureByKey.size !== pairings.length) errors.push('The persisted schedule is missing one or more required participant pairings.');
  const requiredConcurrentMatches = Math.max(0, ...slotCounts.values());
  if (requiredConcurrentMatches > concurrentMatches) {
    errors.push(`A concurrency slot requires ${requiredConcurrentMatches} matches, exceeding the configured capacity of ${concurrentMatches}.`);
  }
  for (const [slotKey, fixtureCount] of slotCounts) {
    if ((slotParticipants.get(slotKey)?.size ?? 0) !== fixtureCount * 2) {
      errors.push(`Concurrency slot ${slotKey} schedules a participant more than once at the same time.`);
    }
  }

  const maximumFixturesPerParticipantPerPeriod = Math.max(0, ...participantPeriodCounts.values());
  const overTargetAssignments = [...participantPeriodCounts.values()]
    .filter((count) => count > matchesPerParticipant).length;
  if (overTargetAssignments > 0) {
    densityWarnings.push(
      `${overTargetAssignments} participant-period assignment(s) exceed the soft target of ${matchesPerParticipant}; the complete schedule is retained.`,
    );
  }

  return {
    valid: errors.length === 0,
    totalFixtures: fixtures.length,
    fixturesPerParticipant: [...participantCounts.entries()]
      .map(([participantId, fixtureCount]) => ({ participantId, fixtureCount }))
      .sort((a, b) => a.participantId.localeCompare(b.participantId)),
    fixturesPerSchedulingPeriod: [...periodCounts.entries()]
      .map(([periodNumber, fixtureCount]) => ({ periodNumber, fixtureCount }))
      .sort((a, b) => a.periodNumber - b.periodNumber),
    maximumFixturesPerParticipantPerPeriod,
    requiredConcurrentMatches,
    configuredConcurrentMatches: concurrentMatches,
    schedulingPeriodsRequired: periodCounts.size ? Math.max(...periodCounts.keys()) : 0,
    errors: [...new Set(errors)],
    densityWarnings,
  };
}

function parseZonedInstant(value: string, label: string) {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new BadRequestException(`${label} must include an explicit timezone offset`);
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new BadRequestException(`${label} is invalid`);
  return instant;
}

function assertIanaTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new BadRequestException(`Timezone "${timezone}" is not a valid IANA timezone`);
  }
}

function localMinuteOfDay(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour * 60 + minute;
}

function validateAppointmentWithinDivisionWindow(
  scheduledAt: Date,
  timezone: string,
  division: { match_window_start_minutes: number | null; match_window_end_minutes: number | null },
) {
  const start = division.match_window_start_minutes;
  const end = division.match_window_end_minutes;
  if (start === null && end === null) return;
  if (start === null || end === null) {
    throw new BadRequestException('Division match window must have both a start and end time');
  }
  const localMinute = localMinuteOfDay(scheduledAt, timezone);
  if (localMinute < start || localMinute > end) {
    throw new BadRequestException('Scheduled appointment falls outside the division match window in its configured timezone');
  }
}

function fixtureOperationalInterval(fixture: ScheduleFixtureRecord) {
  if (fixture.check_in_opens_at && fixture.play_window_closes_at) {
    return { start: fixture.check_in_opens_at, end: fixture.play_window_closes_at };
  }
  if (fixture.scheduled_at) {
    return { start: fixture.scheduled_at, end: new Date(fixture.scheduled_at.getTime() + 1) };
  }
  return null;
}

function countScheduleConflicts(fixtures: ScheduleFixtureRecord[], concurrentMatches: number) {
  const conflictFixtureIds = new Set<string>();
  const intervals = fixtures
    .map((fixture) => ({ fixture, interval: fixtureOperationalInterval(fixture) }))
    .filter((item): item is { fixture: ScheduleFixtureRecord; interval: { start: Date; end: Date } } => Boolean(item.interval))
    .sort((a, b) => a.interval.start.getTime() - b.interval.start.getTime());

  const byPlayer = new Map<string, typeof intervals>();
  for (const item of intervals) {
    for (const playerId of [item.fixture.home_player_id, item.fixture.away_player_id]) {
      const playerIntervals = byPlayer.get(playerId) ?? [];
      playerIntervals.push(item);
      byPlayer.set(playerId, playerIntervals);
    }
  }
  for (const playerIntervals of byPlayer.values()) {
    for (let currentIndex = 0; currentIndex < playerIntervals.length; currentIndex += 1) {
      const current = playerIntervals[currentIndex];
      for (let otherIndex = currentIndex + 1; otherIndex < playerIntervals.length; otherIndex += 1) {
        const other = playerIntervals[otherIndex];
        if (other.interval.start >= current.interval.end) break;
        conflictFixtureIds.add(current.fixture.id);
        conflictFixtureIds.add(other.fixture.id);
      }
    }
  }

  const events = intervals.flatMap(({ fixture, interval }) => [
    { at: interval.start.getTime(), delta: 1, fixtureId: fixture.id },
    { at: interval.end.getTime(), delta: -1, fixtureId: fixture.id },
  ]).sort((a, b) => a.at - b.at || a.delta - b.delta);
  const active = new Set<string>();
  for (const event of events) {
    if (event.delta < 0) {
      active.delete(event.fixtureId);
      continue;
    }
    if (active.size >= concurrentMatches) conflictFixtureIds.add(event.fixtureId);
    active.add(event.fixtureId);
  }

  return conflictFixtureIds.size;
}

function getCurrentRound(fixtures: ScheduleFixtureRecord[]) {
  const terminalMatchStatuses = new Set(['COMPLETED', 'CANCELLED', 'CONFIRMED', 'ARCHIVED', 'VOID', 'FORFEITED']);
  const activeRounds = fixtures
    .filter((fixture) => !fixture.match?.status || !terminalMatchStatuses.has(fixture.match.status))
    .map((fixture) => fixture.match_week?.week_number)
    .filter((round): round is number => round !== undefined);
  return activeRounds.length ? Math.min(...activeRounds) : null;
}

function isRetryableScheduleConflict(error: unknown) {
  return typeof error === 'object' && error !== null &&
    'code' in error && ['P2002', 'P2034'].includes(String(error.code));
}


export async function ensureMatchWeeks(
  tx: Prisma.TransactionClient,
  seasonId: string,
  divisionId: string,
  roundCount: number,
) {
  for (let round = 1; round <= roundCount; round += 1) {
    await tx.matchWeek.upsert({
      where: {
        season_id_division_id_week_number: {
          season_id: seasonId,
          division_id: divisionId,
          week_number: round,
        },
      },
      update: {},
      create: {
        season_id: seasonId,
        division_id: divisionId,
        week_number: round,
      },
    });
  }
}

export function buildRoundRobin(playerIds: string[], format: CompetitionFormat): Pairing[] {
  if (playerIds.length < 2) return [];

  const double = format === 'ROUND_ROBIN_DOUBLE';
  if (!double && format !== 'ROUND_ROBIN_SINGLE') {
    throw new BadRequestException(`Unsupported competition format: ${String(format)}`);
  }
  const players: Array<string | null> = [...playerIds];
  if (players.length % 2 === 1) players.push(null);

  const size = players.length;
  const firstLegRounds: Pairing[] = [];
  let current = [...players];

  for (let round = 1; round < size; round += 1) {
    for (let i = 0; i < size / 2; i += 1) {
      const a = current[i];
      const b = current[size - 1 - i];
      if (a === null || b === null) continue;

      const home = round % 2 === 1 ? a : b;
      const away = round % 2 === 1 ? b : a;
      firstLegRounds.push({ homePlayerId: home, awayPlayerId: away, round, leg: 1 });
    }

    const fixed = current[0];
    const rotating = current.slice(1);
    rotating.unshift(rotating.pop()!);
    current = [fixed, ...rotating];
  }

  if (!double) return firstLegRounds;

  return [
    ...firstLegRounds,
    ...firstLegRounds.map((pairing) => ({
      homePlayerId: pairing.awayPlayerId,
      awayPlayerId: pairing.homePlayerId,
      round: pairing.round + (size - 1),
      leg: 2 as const,
    })),
  ];
}
