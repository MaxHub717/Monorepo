import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_KEY } from '../../common/authz/authz.decorators.js';
import { AccountStatusGuard, AuthGuard } from '../../common/authz/authz.guards.js';
import { NotificationController } from './notification.controller.js';

describe('NotificationController personal access', () => {
  it('lists notifications only for the authenticated user', async () => {
    const notificationService = { listNotifications: vi.fn().mockResolvedValue([{ id: 'notification-1' }]) };
    const controller = new NotificationController(notificationService as any);

    await expect(controller.listNotifications({ user: { id: 'user-1' } } as any))
      .resolves.toEqual([{ id: 'notification-1' }]);
    expect(notificationService.listNotifications).toHaveBeenCalledWith('user-1');
  });

  it('requires authentication and an active account and is not public', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, NotificationController);
    expect(guards).toEqual(expect.arrayContaining([AuthGuard, AccountStatusGuard]));
    expect(Reflect.getMetadata(PUBLIC_KEY, NotificationController)).toBeUndefined();
    expect(Reflect.getMetadata(PUBLIC_KEY, NotificationController.prototype.listNotifications)).toBeUndefined();
  });
});