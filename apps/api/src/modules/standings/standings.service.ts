import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class StandingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSeasonStandings(seasonId: string) {
    // Recompute standings from confirmed match results
    await this.recomputeStandings(seasonId);

    const rows = await this.prisma.standingsRow.findMany({
      where: { season_id: seasonId },
      include: { club: true },
      orderBy: [{ points: 'desc' }, { goals_for: 'desc' }, { goals_against: 'asc' }],
    });

    return { seasonId, rows };
  }

  async getLeaderboards() {
    // simple leaderboards: top clubs by points (most recent season)
    const latestSeason = await this.prisma.season.findFirst({ orderBy: { created_at: 'desc' } });
    if (!latestSeason) return { players: [], clubs: [] };

    const rows = await this.prisma.standingsRow.findMany({ where: { season_id: latestSeason.id }, include: { club: true }, orderBy: { points: 'desc' } });

    const clubs = rows.slice(0, 10).map((r: any) => ({ club: r.club, points: r.points }));

    return { players: [], clubs };
  }

  private async recomputeStandings(seasonId: string) {
    // Aggregate confirmed match results for the season
    const results = await this.prisma.matchResult.findMany({
      where: { match: { season_id: seasonId }, confirmed_at: { not: null } },
      include: { match: { include: { fixture: true } } },
    });

    const clubStats: Record<string, { games: number; wins: number; draws: number; losses: number; goals_for: number; goals_against: number; points: number }> = {};

    for (const r of results) {
      const homeClubId = r.match.fixture.home_club_id;
      const awayClubId = r.match.fixture.away_club_id;

      const ensure = (id: string) => {
        if (!clubStats[id]) clubStats[id] = { games: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0 };
      };

      ensure(homeClubId);
      ensure(awayClubId);

      clubStats[homeClubId].games += 1;
      clubStats[awayClubId].games += 1;

      clubStats[homeClubId].goals_for += r.home_score;
      clubStats[homeClubId].goals_against += r.away_score;
      clubStats[awayClubId].goals_for += r.away_score;
      clubStats[awayClubId].goals_against += r.home_score;

      if (r.home_score > r.away_score) {
        clubStats[homeClubId].wins += 1;
        clubStats[awayClubId].losses += 1;
        clubStats[homeClubId].points += 3;
      } else if (r.home_score < r.away_score) {
        clubStats[awayClubId].wins += 1;
        clubStats[homeClubId].losses += 1;
        clubStats[awayClubId].points += 3;
      } else {
        clubStats[homeClubId].draws += 1;
        clubStats[awayClubId].draws += 1;
        clubStats[homeClubId].points += 1;
        clubStats[awayClubId].points += 1;
      }
    }

    // Upsert standings rows
    for (const [clubId, stats] of Object.entries(clubStats)) {
      // find existing row for season+club
      const existingRow = await this.prisma.standingsRow.findFirst({ where: { season_id: seasonId, club_id: clubId } });
      if (existingRow) {
        await this.prisma.standingsRow.update({ where: { id: existingRow.id }, data: { games_played: stats.games, wins: stats.wins, draws: stats.draws, losses: stats.losses, goals_for: stats.goals_for, goals_against: stats.goals_against, points: stats.points, updated_at: new Date() } });
        continue;
      }

      // find a division for the season to attach the standings row, or create one
      let division = await this.prisma.division.findFirst({ where: { season_id: seasonId } });
      if (!division) {
        division = await this.prisma.division.create({ data: { season_id: seasonId, name: 'Division 1', description: 'Auto-created division' } });
      }

      await this.prisma.standingsRow.create({ data: { season_id: seasonId, division_id: division.id, club_id: clubId, games_played: stats.games, wins: stats.wins, draws: stats.draws, losses: stats.losses, goals_for: stats.goals_for, goals_against: stats.goals_against, points: stats.points } });
    }
  }
}
