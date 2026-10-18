import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const publicLeagueSelect = {
  id: true,
  name: true,
  description: true,
  region: true,
  seasons: {
    where: { status: { not: 'DRAFT' }, deleted_at: null },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      start_date: true,
      end_date: true,
      competition_timezone: true,
    },
    orderBy: { created_at: 'desc' as const },
  },
} as const;

function toPublicLeague(league: {
  id: string;
  name: string;
  description: string | null;
  region: string | null;
  seasons: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    start_date: Date | null;
    end_date: Date | null;
    competition_timezone: string;
  }>;
}) {
  return {
    id: league.id,
    name: league.name,
    description: league.description,
    region: league.region,
    seasons: league.seasons.map((season) => ({
      id: season.id,
      name: season.name,
      description: season.description,
      status: season.status,
      startDate: season.start_date,
      endDate: season.end_date,
      timezone: season.competition_timezone,
    })),
  };
}

@Injectable()
export class PublicLeagueService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublicLeagues() {
    const leagues = await this.prisma.league.findMany({
      where: { status: 'ACTIVE', deleted_at: null },
      select: publicLeagueSelect,
      orderBy: { created_at: 'desc' },
    });
    return leagues.map(toPublicLeague);
  }

  async getPublicLeague(leagueId: string) {
    const league = await this.prisma.league.findFirst({
      where: { id: leagueId, status: 'ACTIVE', deleted_at: null },
      select: publicLeagueSelect,
    });
    if (!league) throw new NotFoundException('Public league not found');
    return toPublicLeague(league);
  }
}