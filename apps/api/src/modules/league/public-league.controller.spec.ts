import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_KEY } from '../../common/authz/authz.decorators.js';
import { PublicLeagueController } from './public-league.controller.js';

describe('PublicLeagueController', () => {
  it('exposes only read handlers as public routes', async () => {
    const leagues = [{ id: 'league-1', name: 'NGL League' }];
    const leagueService = {
      listPublicLeagues: vi.fn().mockResolvedValue(leagues),
      getPublicLeague: vi.fn().mockResolvedValue(leagues[0]),
    };
    const controller = new PublicLeagueController(leagueService as any);

    await expect(controller.listPublicLeagues()).resolves.toEqual(leagues);
    await expect(controller.getPublicLeague('league-1')).resolves.toEqual(leagues[0]);
    expect(leagueService.getPublicLeague).toHaveBeenCalledWith('league-1');
    expect(Reflect.getMetadata(PUBLIC_KEY, PublicLeagueController.prototype.listPublicLeagues)).toBe(true);
    expect(Reflect.getMetadata(PUBLIC_KEY, PublicLeagueController.prototype.getPublicLeague)).toBe(true);
  });
});