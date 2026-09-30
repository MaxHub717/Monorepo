import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, CompetitionFormat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { DivisionFixtureStatusDto, SeasonFixtureStatusDto } from './fixture.dto.js';

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
        where: { season_id: seasonId, division_id: divisionId, status: 'ACTIVE' },
        select: { player_id: true, seed: true, registered_at: true },
      });

      if (participants.length < 2) {
        throw new BadRequestException(`Division "${division.name}" needs at least two eligible active participants; found ${participants.length}`);
      }

      participants.sort(compareParticipants);

      const pairings = buildRoundRobin(participants.map((p) => p.player_id), division.format);
      const rounds = Math.max(...pairings.map((p) => p.round));

      const existingFixtures = await tx.fixture.findMany({
        where: { division_id: divisionId },
        select: {
          id: true,
          schedule_key: true,
          fixture_number: true,
          match_week: { select: { week_number: true } },
          home_player_id: true,
          away_player_id: true,
          match: { select: { id: true } },
        },
      });

      if (existingFixtures.length) {
        if (isCompleteGeneratedSchedule(pairings, existingFixtures)) {
          return {
            seasonId,
            divisionId,
            format: division.format,
            status: 'ALREADY_GENERATED',
            participantCount: participants.length,
            roundCount: rounds,
            expectedFixtureCount: pairings.length,
            fixtureCount: existingFixtures.length,
          };
        }
        throw new BadRequestException(
          `Division already contains ${existingFixtures.length} fixtures that do not match the complete generated schedule of ${pairings.length}; resolve existing fixtures before generation`,
        );
      }

      await ensureMatchWeeks(tx, seasonId, divisionId, rounds);

      const weeks = await tx.matchWeek.findMany({
        where: { season_id: seasonId, division_id: divisionId },
        orderBy: { week_number: 'asc' },
      });
      const weekByRound = new Map(weeks.map((week) => [week.week_number, week]));

      for (const [index, pairing] of pairings.entries()) {
        const week = weekByRound.get(pairing.round);
        if (!week) throw new Error(`Match week ${pairing.round} was not created`);

        const [first, second] = [pairing.homePlayerId, pairing.awayPlayerId].sort();
        const scheduleKey = `${first}:${second}:${pairing.leg}`;

        const fixture = await tx.fixture.create({
          data: {
            division_id: divisionId,
            match_week_id: week.id,
            fixture_number: index + 1,
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
          participantCount: participants.length,
          roundCount: rounds,
          fixtureCount: pairings.length,
        },
      });

      return {
        seasonId,
        divisionId,
        format: division.format,
        status: 'GENERATED',
        participantCount: participants.length,
        roundCount: rounds,
        expectedFixtureCount: pairings.length,
        fixtureCount: pairings.length,
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
            expectedFixtureCount: status.expectedFixtureCount,
            fixtureCount: status.currentFixtureCount,
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
      where: { season_id: seasonId, division_id: divisionId, status: 'ACTIVE' },
      select: { player_id: true, seed: true, registered_at: true },
    });
    participants.sort(compareParticipants);

    const pairings = participants.length >= 2
      ? buildRoundRobin(participants.map(({ player_id }) => player_id), division.format)
      : [];
    const fixtures = await this.prisma.fixture.findMany({
      where: { division_id: divisionId },
      select: {
        schedule_key: true,
        fixture_number: true,
        match_week: { select: { week_number: true } },
        home_player_id: true,
        away_player_id: true,
        match: { select: { id: true } },
      },
    });

    const blockers: string[] = [];
    const warnings: string[] = [];
    if (season.status !== 'ROSTER_LOCKED') blockers.push(`Season must be ROSTER_LOCKED to generate fixtures (current status: ${season.status}).`);
    if (!division.active) blockers.push('Division is inactive.');
    if (participants.length < 2) blockers.push(`At least two eligible active participants are required; found ${participants.length}.`);
    if (fixtures.length > 0 && !isCompleteGeneratedSchedule(pairings, fixtures)) {
      blockers.push('Existing fixtures do not match a complete generated schedule and need review before generation.');
    }

    const generationStatus = fixtures.length
      ? isCompleteGeneratedSchedule(pairings, fixtures) ? 'GENERATED' : 'INCOMPLETE'
      : blockers.length ? 'BLOCKED' : 'NOT_GENERATED';
    if (generationStatus === 'GENERATED' && season.status !== 'ROSTER_LOCKED') {
      warnings.push('The schedule exists; further fixture generation is disabled outside ROSTER_LOCKED.');
    }

    return {
      divisionId,
      divisionName: division.name,
      active: division.active,
      format: division.format,
      participantCount: participants.length,
      expectedFixtureCount: pairings.length,
      currentFixtureCount: fixtures.length,
      roundCount: pairings.length ? Math.max(...pairings.map(({ round }) => round)) : 0,
      generationStatus,
      blockers,
      warnings,
    };
  }
}

function compareParticipants(
  a: { player_id: string; seed: number | null; registered_at: Date },
  b: { player_id: string; seed: number | null; registered_at: Date },
) {
  if (a.seed !== null && b.seed !== null && a.seed !== b.seed) return a.seed - b.seed;
  if (a.seed !== null && b.seed === null) return -1;
  if (a.seed === null && b.seed !== null) return 1;
  const registered = a.registered_at.getTime() - b.registered_at.getTime();
  return registered || a.player_id.localeCompare(b.player_id);
}

function scheduleKey(pairing: Pairing) {
  const [first, second] = [pairing.homePlayerId, pairing.awayPlayerId].sort();
  return `${first}:${second}:${pairing.leg}`;
}

function isCompleteGeneratedSchedule(
  pairings: Pairing[],
  fixtures: Array<{
    schedule_key: string | null;
    fixture_number: number | null;
    match_week: { week_number: number } | null;
    home_player_id: string;
    away_player_id: string;
    match: { id: string } | null;
  }>,
) {
  if (pairings.length === 0 || fixtures.length !== pairings.length) return false;
  const fixtureByKey = new Map(fixtures.map((fixture) => [fixture.schedule_key, fixture]));
  if (fixtureByKey.size !== pairings.length) return false;

  return pairings.every((pairing, index) => {
    const fixture = fixtureByKey.get(scheduleKey(pairing));
    return Boolean(
      fixture &&
      fixture.fixture_number === index + 1 &&
      fixture.home_player_id === pairing.homePlayerId &&
      fixture.away_player_id === pairing.awayPlayerId &&
      fixture.match_week?.week_number === pairing.round &&
      fixture.match?.id,
    );
  });
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
