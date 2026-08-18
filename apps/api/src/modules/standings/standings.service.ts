import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

interface PlayerStats {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  points: number;
}

@Injectable()
export class StandingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSeasonStandings(seasonId: string, divisionId?: string) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) throw new NotFoundException('Season not found');

    if (divisionId) {
      const division = await this.prisma.division.findUnique({ where: { id: divisionId } });
      if (!division || division.season_id !== seasonId) {
        throw new NotFoundException('Division not found for this season');
      }
    }

    await this.recomputeStandings(seasonId, divisionId);

    const rows = await this.prisma.standingsRow.findMany({
      where: {
        season_id: seasonId,
        ...(divisionId ? { division_id: divisionId } : {}),
      },
      include: {
        player: true,
        division: true,
      },
      orderBy: [
        { points: 'desc' },
        { goals_for: 'desc' },
        { goals_against: 'asc' },
        { player_id: 'asc' },
      ],
    });

    const rankedRows = rows.map((row, index) => ({
      ...row,
      ranking: index + 1,
    }));

    if (rankedRows.length) {
      await this.prisma.$transaction(
        rankedRows.map((row) =>
          this.prisma.standingsRow.update({
            where: { id: row.id },
            data: { ranking: row.ranking },
          }),
        ),
      );
    }

    return { seasonId, divisionId: divisionId ?? null, rows: rankedRows };
  }

  async getLeaderboards() {
    const latestSeason = await this.prisma.season.findFirst({
      orderBy: { created_at: 'desc' },
    });
    if (!latestSeason) return { players: [] };

    await this.recomputeStandings(latestSeason.id);

    const rows = await this.prisma.standingsRow.findMany({
      where: { season_id: latestSeason.id },
      include: { player: true, division: true },
      orderBy: [
        { points: 'desc' },
        { goals_for: 'desc' },
        { goals_against: 'asc' },
      ],
      take: 10,
    });

    return {
      season: latestSeason,
      players: rows.map((row, index) => ({
        rank: index + 1,
        player: row.player,
        division: row.division,
        points: row.points,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        gamesPlayed: row.games_played,
        goalsFor: row.goals_for,
        goalsAgainst: row.goals_against,
      })),
    };
  }

  private async recomputeStandings(seasonId: string, divisionId?: string) {
    const participants = await this.prisma.divisionParticipant.findMany({
      where: {
        season_id: seasonId,
        status: 'ACTIVE',
        ...(divisionId ? { division_id: divisionId } : {}),
      },
      select: { player_id: true, division_id: true },
    });

    const stats = new Map<string, PlayerStats>();
    const playerDivision = new Map<string, string>();

    for (const participant of participants) {
      stats.set(participant.player_id, {
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        points: 0,
      });
      playerDivision.set(participant.player_id, participant.division_id);
    }

    const results = await this.prisma.matchResult.findMany({
      where: {
        confirmed_at: { not: null },
        match: {
          season_id: seasonId,
          ...(divisionId ? { division_id: divisionId } : {}),
        },
      },
      include: {
        match: {
          include: { fixture: true },
        },
      },
    });

    for (const result of results) {
      const homePlayerId = result.match.fixture.home_player_id;
      const awayPlayerId = result.match.fixture.away_player_id;
      const home = stats.get(homePlayerId);
      const away = stats.get(awayPlayerId);

      // Ignore results for players no longer participating in the selected division.
      if (!home || !away) continue;

      home.games += 1;
      away.games += 1;
      home.goals_for += result.home_score;
      home.goals_against += result.away_score;
      away.goals_for += result.away_score;
      away.goals_against += result.home_score;

      if (result.home_score > result.away_score) {
        home.wins += 1;
        away.losses += 1;
        home.points += 3;
      } else if (result.home_score < result.away_score) {
        away.wins += 1;
        home.losses += 1;
        away.points += 3;
      } else {
        home.draws += 1;
        away.draws += 1;
        home.points += 1;
        away.points += 1;
      }
    }

    const divisionIds = [...new Set(playerDivision.values())];

    for (const currentDivisionId of divisionIds) {
      const playerIds = [...playerDivision.entries()]
        .filter(([, value]) => value === currentDivisionId)
        .map(([playerId]) => playerId);

      for (const playerId of playerIds) {
        const playerStats = stats.get(playerId)!;
        await this.prisma.standingsRow.upsert({
          where: {
            season_id_division_id_player_id: {
              season_id: seasonId,
              division_id: currentDivisionId,
              player_id: playerId,
            },
          },
          create: {
            season_id: seasonId,
            division_id: currentDivisionId,
            player_id: playerId,
            games_played: playerStats.games,
            wins: playerStats.wins,
            draws: playerStats.draws,
            losses: playerStats.losses,
            goals_for: playerStats.goals_for,
            goals_against: playerStats.goals_against,
            points: playerStats.points,
          },
          update: {
            games_played: playerStats.games,
            wins: playerStats.wins,
            draws: playerStats.draws,
            losses: playerStats.losses,
            goals_for: playerStats.goals_for,
            goals_against: playerStats.goals_against,
            points: playerStats.points,
            ranking: 0,
          },
        });
      }
    }
  }
}
