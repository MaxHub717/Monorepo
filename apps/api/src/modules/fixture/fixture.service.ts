import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, CompetitionFormat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { DivisionFixtureStatusDto, FixtureScheduleValidationDto, SeasonFixtureStatusDto } from './fixture.dto.js';
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
  match: { id: string } | null;
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
    const season = await this.prisma.season.findUnique({ where: { id: seasonId }, select: { id: true, status: true } });
    if (!season) throw new NotFoundException('Season not found');

    const divisions = await this.prisma.division.findMany({
      where: { season_id: seasonId },
      select: { id: true },
      orderBy: { name: 'asc' },
    });

    return {
      seasonId,
      seasonStatus: season.status,
      divisions: await Promise.all(divisions.map(({ id }) => this.getDivisionScheduleStatus(seasonId, id))),
    };
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
            match_week: { select: { week_number: true } },
            home_player_id: true,
            away_player_id: true,
            match: { select: { id: true } },
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
      roundCount,
      schedulingPeriodCount: roundCount ? Math.ceil(roundCount / division.matches_per_participant) : 0,
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
