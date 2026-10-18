import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_KEY, PERMISSIONS_KEY } from '../../common/authz/authz.decorators.js';
import { CompetitionController } from './competition.controller.js';
import { PublicCompetitionController } from './public-competition.controller.js';

describe('PublicCompetitionController', () => {
  it('exposes the read-only schedule route publicly while retaining workspace permissions', async () => {
    const schedule = { season: { id: 'season-1' }, phases: [] };
    const series = { id: 'series-1', games: [] };
    const results = { season: { id: 'season-1' }, results: [] };
    const competitionService = {
      getPublicSeasonSchedule: vi.fn().mockResolvedValue(schedule),
      getPublicSeriesDetail: vi.fn().mockResolvedValue(series),
      getPublicSeasonResults: vi.fn().mockResolvedValue(results),
    };
    const controller = new PublicCompetitionController(competitionService as any);

    await expect(controller.getPublicSeasonSchedule('season-1')).resolves.toEqual(schedule);
    await expect(controller.getPublicSeriesDetail('series-1')).resolves.toEqual(series);
    await expect(controller.getPublicSeasonResults('season-1')).resolves.toEqual(results);
    expect(competitionService.getPublicSeasonSchedule).toHaveBeenCalledWith('season-1');
    expect(competitionService.getPublicSeriesDetail).toHaveBeenCalledWith('series-1');
    expect(competitionService.getPublicSeasonResults).toHaveBeenCalledWith('season-1');
    expect(Reflect.getMetadata(PUBLIC_KEY, PublicCompetitionController.prototype.getPublicSeasonSchedule)).toBe(true);
    expect(Reflect.getMetadata(PUBLIC_KEY, PublicCompetitionController.prototype.getPublicSeriesDetail)).toBe(true);
    expect(Reflect.getMetadata(PUBLIC_KEY, PublicCompetitionController.prototype.getPublicSeasonResults)).toBe(true);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CompetitionController)).toContain('MANAGE_MATCHES');
  });
});