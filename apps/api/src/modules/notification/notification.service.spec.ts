import { describe, expect, it, vi } from 'vitest';
import { createCompetitionNotifications } from './notification.service.js';

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
