import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_KEY, PERMISSIONS_KEY } from '../../common/authz/authz.decorators.js';
import { PlayerController } from './player.controller.js';

describe('PlayerController public profiles', () => {
  it('marks public directory and detail handlers public while keeping personal endpoints authenticated', async () => {
    const publicPlayers = [{ id: 'player-1', gamerTag: 'NorthStar', region: 'West' }];
    const playerService = {
      listPublicPlayers: vi.fn().mockResolvedValue(publicPlayers),
      getPublicProfile: vi.fn().mockResolvedValue({ player: publicPlayers[0], career: [] }),
      getMyCareer: vi.fn().mockResolvedValue({ player: { id: 'player-1', gamerTag: 'NorthStar' }, career: [] }),
      updateProfile: vi.fn().mockResolvedValue({ id: 'player-1', gamer_tag: 'UpdatedTag' }),
    };
    const controller = new PlayerController(playerService as any);

    await expect(controller.listPublicPlayers()).resolves.toEqual(publicPlayers);
    await expect(controller.getPublicProfile('player-1')).resolves.toEqual({ player: publicPlayers[0], career: [] });
    await expect(controller.getMyCareer('user-1')).resolves.toEqual({
      player: { id: 'player-1', gamerTag: 'NorthStar' }, career: [],
    });
    await expect(controller.updateMyProfile('user-1', { gamerTag: 'UpdatedTag' }, ['PLAYER']))
      .resolves.toEqual({ id: 'player-1', gamer_tag: 'UpdatedTag' });
    expect(playerService.updateProfile).toHaveBeenCalledWith('user-1', { gamerTag: 'UpdatedTag' }, 'user-1', 'PLAYER');
    expect(playerService.getMyCareer).toHaveBeenCalledWith('user-1');
    expect(Reflect.getMetadata(PUBLIC_KEY, PlayerController.prototype.listPublicPlayers)).toBe(true);
    expect(Reflect.getMetadata(PUBLIC_KEY, PlayerController.prototype.getPublicProfile)).toBe(true);
    expect(Reflect.getMetadata(PUBLIC_KEY, PlayerController.prototype.getMyProfile)).toBeUndefined();
    expect(Reflect.getMetadata(PUBLIC_KEY, PlayerController.prototype.getMyCareer)).toBeUndefined();
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PlayerController)).toBeUndefined();
  });
});