import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PublicLeagueService } from './public-league.service.js';

describe('PublicLeagueService', () => {
  it('lists active, non-deleted leagues with only public fields and visible seasons', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: 'league-1',
      name: 'NGL League',
      description: 'Public league description',
      region: 'North',
      seasons: [{
        id: 'season-1',
        name: 'Season One',
        description: 'Public season description',
        status: 'REGISTRATION_CLOSED',
        start_date: new Date('2026-10-14T00:00:00.000Z'),
        end_date: new Date('2026-10-28T00:00:00.000Z'),
        competition_timezone: 'UTC',
      }],
    }]);
    const service = new PublicLeagueService({ league: { findMany } } as unknown as PrismaService);

    const result = await service.listPublicLeagues();

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'ACTIVE', deleted_at: null },
      select: expect.objectContaining({
        id: true,
        name: true,
        description: true,
        region: true,
        seasons: expect.objectContaining({
          where: { status: { not: 'DRAFT' }, deleted_at: null },
        }),
      }),
    }));
    const selection = findMany.mock.calls[0][0].select;
    expect(selection).not.toHaveProperty('metadata_json');
    expect(selection).not.toHaveProperty('operators');
    expect(selection).not.toHaveProperty('_count');
    expect(result).toEqual([{
      id: 'league-1',
      name: 'NGL League',
      description: 'Public league description',
      region: 'North',
      seasons: [{
        id: 'season-1',
        name: 'Season One',
        description: 'Public season description',
        status: 'REGISTRATION_CLOSED',
        startDate: new Date('2026-10-14T00:00:00.000Z'),
        endDate: new Date('2026-10-28T00:00:00.000Z'),
        timezone: 'UTC',
      }],
    }]);
  });

  it('does not return inactive, archived, deleted, or missing leagues from detail lookup', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new PublicLeagueService({ league: { findFirst } } as unknown as PrismaService);

    await expect(service.getPublicLeague('private-league')).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'private-league', status: 'ACTIVE', deleted_at: null },
    }));
  });
});