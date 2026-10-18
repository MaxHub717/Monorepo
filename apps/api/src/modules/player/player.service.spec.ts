import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PlayerService } from './player.service.js';

function createService(profile: any = null, career: unknown[] = []) {
  const findUnique = vi.fn().mockResolvedValue(profile);
  const findFirst = vi.fn().mockResolvedValue(profile);
  const findMany = vi.fn().mockResolvedValue(profile ? [profile] : []);
  const prisma = { playerProfile: { findUnique, findFirst, findMany } };
  const competitionService = { getPublicPlayerCareer: vi.fn().mockResolvedValue(career) };
  const service = new PlayerService(prisma as any, {} as any, {} as any, competitionService as any);
  return { service, findUnique, findFirst, findMany, competitionService };
}

describe('PlayerService public profiles', () => {
  it('lists only opted-in profiles with an explicit public field allowlist', async () => {
    const { service, findMany } = createService({
      id: 'player-1',
      gamer_tag: 'NorthStar',
      region: 'West',
      public_profile: true,
      user_id: 'user-private',
      verification_status: 'VERIFIED',
      email: 'private@example.test',
      classification: 'ELITE',
    });

    const result = await service.listPublicPlayers();

    expect(findMany).toHaveBeenCalledWith({
      where: { public_profile: true, deleted_at: null },
      select: { id: true, gamer_tag: true, region: true },
      orderBy: { gamer_tag: 'asc' },
    });
    expect(result).toEqual([{ id: 'player-1', gamerTag: 'NorthStar', region: 'West' }]);
    expect(JSON.stringify(result)).not.toContain('private@example.test');
    expect(JSON.stringify(result)).not.toContain('VERIFIED');
    expect(JSON.stringify(result)).not.toContain('ELITE');
  });

  it('does not resolve opted-out profiles and returns only approved identity fields for public profiles', async () => {
    const privateProfile = createService(null);
    await expect(privateProfile.service.getPublicProfile('player-private')).rejects.toBeInstanceOf(NotFoundException);
    expect(privateProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'player-private', public_profile: true, deleted_at: null },
      select: { id: true, gamer_tag: true, region: true },
    });

    const { service, competitionService } = createService({
      id: 'player-1',
      gamer_tag: 'NorthStar',
      region: 'West',
      user_id: 'user-private',
      email: 'private@example.test',
      verification_status: 'VERIFIED',
      player_status: 'REGISTERED',
      classification: 'ELITE',
      metadata_json: { phone: 'private' },
    }, []);
    const result = await service.getPublicProfile('player-1');

    expect(result).toEqual({
      player: { id: 'player-1', gamerTag: 'NorthStar', region: 'West' },
      career: [],
    });
    expect(competitionService.getPublicPlayerCareer).toHaveBeenCalledWith('player-1', 'NorthStar');
    expect(JSON.stringify(result)).not.toContain('private@example.test');
    expect(JSON.stringify(result)).not.toContain('VERIFIED');
    expect(JSON.stringify(result)).not.toContain('ELITE');
    expect(JSON.stringify(result)).not.toContain('private');
  });
});

describe('PlayerService personal career access', () => {
  const profile = { id: 'player-1', user_id: 'user-1', wins: 3, losses: 1, draws: 0 };

  it('allows the owner and rejects other signed-in users', async () => {
    const owner = createService(profile);
    await expect(owner.service.getCareer('player-1', 'user-1', ['PLAYER'])).resolves.toEqual({
      id: 'player-1', matches: 4, wins: 3, losses: 1, draws: 0,
    });

    const otherUser = createService(profile);
    await expect(otherUser.service.getCareer('player-1', 'user-2', ['PLAYER'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('preserves the existing privileged career access', async () => {
    const admin = createService(profile);
    await expect(admin.service.getCareer('player-1', 'admin-1', ['HQ_ADMIN'])).resolves.toMatchObject({ id: 'player-1' });
  });
});

describe('PlayerService personal published career', () => {
  it('resolves career from the authenticated user profile and authoritative published series', async () => {
    const entries = [{ seriesId: 'series-1', games: [{ number: 1, result: { outcome: 'HOME_WIN' } }] }];
    const { service, findUnique, competitionService } = createService({
      id: 'player-1',
      user_id: 'user-1',
      gamer_tag: 'NorthStar',
      public_profile: false,
      email: 'private@example.test',
    }, entries);

    const result = await service.getMyCareer('user-1');

    expect(findUnique).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
      select: { id: true, gamer_tag: true },
    });
    expect(competitionService.getPublicPlayerCareer).toHaveBeenCalledWith('player-1', 'NorthStar');
    expect(result).toEqual({ player: { id: 'player-1', gamerTag: 'NorthStar' }, career: entries });
    expect(JSON.stringify(result)).not.toContain('private@example.test');
  });

  it('does not expose career when the signed-in user has no player profile', async () => {
    const { service, competitionService } = createService(null);
    await expect(service.getMyCareer('user-without-profile')).rejects.toBeInstanceOf(NotFoundException);
    expect(competitionService.getPublicPlayerCareer).not.toHaveBeenCalled();
  });
});

describe('PlayerService profile ownership', () => {
  it('updates only the authenticated owner profile through supported fields', async () => {
    const profile = { id: 'player-1', user_id: 'user-1', gamer_tag: 'OldTag', region: 'West' };
    const findUnique = vi.fn().mockResolvedValue(profile);
    const findFirst = vi.fn().mockResolvedValue(null);
    const update = vi.fn().mockResolvedValue({ ...profile, gamer_tag: 'NewTag', region: 'East', public_profile: true });
    const prisma = { playerProfile: { findUnique, findFirst, update } };
    const auditService = { writeLog: vi.fn().mockResolvedValue(undefined) };
    const outboxService = { enqueueEventDirect: vi.fn().mockResolvedValue(undefined) };
    const service = new PlayerService(prisma as any, auditService as any, outboxService as any, {} as any);

    await service.updateProfile('user-1', {
      gamerTag: 'NewTag',
      region: 'East',
      publicProfile: true,
    }, 'user-1', 'PLAYER');

    expect(findUnique).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
    expect(update).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
      data: { gamer_tag: 'NewTag', region: 'East', public_profile: true },
    });
  });
});