import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_KEY, PUBLIC_KEY } from '../../common/authz/authz.decorators.js';
import { AccountStatusGuard, AuthGuard } from '../../common/authz/authz.guards.js';
import { PlayerCompetitionController } from './competition.controller.js';

describe('PlayerCompetitionController', () => {
  it('derives schedule and check-in identity from the authenticated session', async () => {
    const service = {
      getPlayerSchedule: vi.fn().mockResolvedValue({ entries: [] }),
      recordPlayerSeriesCheckIn: vi.fn().mockResolvedValue({ alreadyCheckedIn: false }),
    };
    const controller = new PlayerCompetitionController(service as any);
    const request = {
      id: 'request-1',
      user: { id: 'user-1', roles: ['PLAYER'], permissions: [] },
    };

    await expect(controller.getMySchedule({ user: request.user } as any)).resolves.toEqual({ entries: [] });
    await expect(controller.checkIn('series-1', request as any)).resolves.toEqual({ alreadyCheckedIn: false });

    expect(service.getPlayerSchedule).toHaveBeenCalledWith('user-1');
    expect(service.recordPlayerSeriesCheckIn).toHaveBeenCalledWith('series-1', 'user-1', {
      id: 'user-1',
      role: 'PLAYER',
      requestId: 'request-1',
      permissions: [],
    });
  });

  it('requires an active authenticated account and is neither public nor operator-permission gated', () => {
    const controllerGuards = Reflect.getMetadata(GUARDS_METADATA, PlayerCompetitionController);

    expect(controllerGuards).toEqual(expect.arrayContaining([AuthGuard, AccountStatusGuard]));
    expect(Reflect.getMetadata(PUBLIC_KEY, PlayerCompetitionController)).toBeUndefined();
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PlayerCompetitionController)).toBeUndefined();
    expect(Reflect.getMetadata(PUBLIC_KEY, PlayerCompetitionController.prototype.checkIn)).toBeUndefined();
  });
});