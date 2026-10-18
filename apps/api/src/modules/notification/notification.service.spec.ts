import { describe, expect, it, vi } from 'vitest';
import { createCompetitionNotifications, NotificationService } from './notification.service.js';

function createTransaction(preference: boolean) {
  const tx = {
    playerProfile: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'player-1', user_id: 'user-1' },
      ]),
    },
    notificationPreference: {
      findMany: vi.fn().mockResolvedValue([{ user_id: 'user-1', competition_enabled: preference }]),
    },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  return tx;
}

describe('competition notifications', () => {
  it('respects disabled competition notification preferences for routine events', async () => {
    const tx = createTransaction(false);

    const result = await createCompetitionNotifications(tx as any, {
      playerIds: ['player-1'],
      eventType: 'SERIES_SCHEDULED',
      eventKey: 'scheduled:series-1',
      title: 'Series scheduled',
      message: 'Series 1 in Phase 1 has been scheduled.',
      relatedEntity: 'Series:series-1',
    });

    expect(result).toEqual({ delivered: 0 });
    expect(tx.notification.createMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('delivers and audits critical events even when routine notifications are disabled', async () => {
    const tx = createTransaction(false);

    const result = await createCompetitionNotifications(tx as any, {
      playerIds: ['player-1'],
      eventType: 'SERIES_RESOLVED',
      eventKey: 'resolved:series-1',
      title: 'Series resolved',
      message: 'Series 1 in Phase 1 has been resolved.',
      relatedEntity: 'Series:series-1',
    });

    expect(result).toEqual({ delivered: 1 });
    expect(tx.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        event_type: 'SERIES_RESOLVED',
        event_key: 'resolved:series-1:user-1',
        priority: 'CRITICAL',
      })],
      skipDuplicates: true,
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'COMPETITION_NOTIFICATION_DELIVERED',
        entity_id: 'resolved:series-1:user-1',
      }),
    }));
  });
});

describe('personal notification access', () => {
  it('lists only the authenticated user notifications and marks only their unread items read', async () => {
    const notifications = [{
      id: 'notification-1',
      user_id: 'user-1',
      title: 'Series scheduled',
      event_type: 'SERIES_SCHEDULED',
      read: false,
    }];
    const prisma = {
      notification: {
        findMany: vi.fn().mockResolvedValue(notifications),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new NotificationService(prisma as any);

    await expect(service.listNotifications('user-1')).resolves.toEqual(notifications);
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
      orderBy: { created_at: 'desc' },
    });

    await expect(service.markAllRead('user-1')).resolves.toEqual({ updated: 1 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1', read: false },
      data: { read: true },
    });
  });

  it('does not list notifications when no authenticated user ID is available', async () => {
    const findMany = vi.fn();
    const service = new NotificationService({ notification: { findMany } } as any);
    await expect(service.listNotifications()).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
