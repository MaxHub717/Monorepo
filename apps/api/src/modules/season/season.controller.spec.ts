import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY, PUBLIC_KEY } from '../../common/authz/authz.decorators.js';
import { AccountStatusGuard, AuthGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { SeasonController } from './season.controller.js';

describe('SeasonController season discovery', () => {
  it('keeps public season listing separate from registration eligibility', async () => {
    const publicSeasons = [{ id: 'season-closed', status: 'REGISTRATION_OPEN' }];
    const registrationSeasons: unknown[] = [];
    const seasonService = {
      listPublicSeasons: vi.fn().mockResolvedValue(publicSeasons),
      getPublicSeason: vi.fn().mockResolvedValue(publicSeasons[0]),
      getPublicSeasonOverview: vi.fn().mockResolvedValue({ id: 'season-closed', phases: [] }),
      listOpenRegistrationSeasons: vi.fn().mockResolvedValue(registrationSeasons),
    };
    const controller = new SeasonController(seasonService as any);

    await expect(controller.listPublicSeasons()).resolves.toEqual(publicSeasons);
    await expect(controller.getPublicSeason('season-closed')).resolves.toEqual(publicSeasons[0]);
    await expect(controller.getPublicSeasonOverview('season-closed')).resolves.toEqual({ id: 'season-closed', phases: [] });
    await expect(controller.listOpenRegistrationSeasons()).resolves.toEqual(registrationSeasons);
    expect(seasonService.listPublicSeasons).toHaveBeenCalledOnce();
    expect(seasonService.getPublicSeason).toHaveBeenCalledWith('season-closed');
    expect(seasonService.getPublicSeasonOverview).toHaveBeenCalledWith('season-closed');
    expect(seasonService.listOpenRegistrationSeasons).toHaveBeenCalledOnce();
    expect(Reflect.getMetadata(PUBLIC_KEY, SeasonController.prototype.listPublicSeasons)).toBe(true);
    expect(Reflect.getMetadata(PUBLIC_KEY, SeasonController.prototype.getPublicSeason)).toBe(true);
    expect(Reflect.getMetadata(PUBLIC_KEY, SeasonController.prototype.getPublicSeasonOverview)).toBe(true);
    expect(Reflect.getMetadata(PUBLIC_KEY, SeasonController.prototype.listOpenRegistrationSeasons)).toBeUndefined();
  });

  it('protects admin season creation and publication with season-management permission', () => {
    for (const handler of [SeasonController.prototype.createSeason, SeasonController.prototype.publishSeason]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual(
        expect.arrayContaining([AuthGuard, AccountStatusGuard, PermissionsGuard]),
      );
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toContain('MANAGE_SEASONS');
      expect(Reflect.getMetadata(PUBLIC_KEY, handler)).toBeUndefined();
    }
  });
});
