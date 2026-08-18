import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, CompetitionFormat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';

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
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.findUnique({ where: { id: seasonId } });
      if (!season) throw new NotFoundException('Season not found');
      if (season.status !== 'ROSTER_LOCKED') {
        throw new BadRequestException('Fixtures can only be generated after the roster is locked');
      }

      const division = await tx.division.findUnique({ where: { id: divisionId } });
      if (!division || division.season_id !== seasonId || !division.active) {
        throw new BadRequestException('Division does not belong to the season or is inactive');
      }

      const existingFixtures = await tx.fixture.findMany({
        where: { division_id: divisionId },
        select: { id: true, schedule_key: true },
      });

      if (existingFixtures.length) {
        const allGenerated = existingFixtures.every((fixture) => Boolean(fixture.schedule_key));
        if (allGenerated) {
          return {
            seasonId,
            divisionId,
            format: division.format,
            status: 'ALREADY_GENERATED',
            fixtureCount: existingFixtures.length,
          };
        }
        throw new BadRequestException('Division already contains manually created fixtures; schedule generation would create conflicts');
      }

      const participants = await tx.divisionParticipant.findMany({
        where: { season_id: seasonId, division_id: divisionId, status: 'ACTIVE' },
        select: { player_id: true, seed: true, registered_at: true },
      });

      if (participants.length < 2) {
        throw new BadRequestException('At least two active players are required to generate a schedule');
      }

      participants.sort((a, b) => {
        if (a.seed !== null && b.seed !== null && a.seed !== b.seed) return a.seed - b.seed;
        if (a.seed !== null && b.seed === null) return -1;
        if (a.seed === null && b.seed !== null) return 1;
        const registered = a.registered_at.getTime() - b.registered_at.getTime();
        return registered || a.player_id.localeCompare(b.player_id);
      });

      const pairings = buildRoundRobin(participants.map((p) => p.player_id), division.format);
      const rounds = Math.max(...pairings.map((p) => p.round));

      for (let round = 1; round <= rounds; round += 1) {
        await tx.matchWeek.create({
          data: {
            season_id: seasonId,
            division_id: divisionId,
            week_number: round,
          },
        });
      }

      const weeks = await tx.matchWeek.findMany({
        where: { season_id: seasonId, division_id: divisionId },
        orderBy: { week_number: 'asc' },
      });
      const weekByRound = new Map(weeks.map((week) => [week.week_number, week]));

      for (const pairing of pairings) {
        const week = weekByRound.get(pairing.round);
        if (!week) throw new Error(`Match week ${pairing.round} was not created`);

        const [first, second] = [pairing.homePlayerId, pairing.awayPlayerId].sort();
        const scheduleKey = `${first}:${second}:${pairing.leg}`;

        const fixture = await tx.fixture.create({
          data: {
            division_id: divisionId,
            match_week_id: week.id,
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
        fixtureCount: pairings.length,
      };
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
