import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxDispatcher } from './outbox.dispatcher.js';
import { PrismaService } from '../prisma/prisma.service.js';

const createPrismaMock = () => ({
  outboxEvent: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
});

const createEventEmitterMock = () => ({ emitAsync: vi.fn() });

describe('OutboxDispatcher', () => {
  let dispatcher: OutboxDispatcher;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let emitterMock: ReturnType<typeof createEventEmitterMock>;

  beforeEach(() => {
    prismaMock = createPrismaMock();
    emitterMock = createEventEmitterMock();
    dispatcher = new OutboxDispatcher(prismaMock as any, emitterMock as any);
  });

  it('publishes pending events and marks them as published', async () => {
    const event = {
      id: 'event-id',
      event_name: 'match.created',
      aggregate_type: 'Match',
      aggregate_id: 'match-id',
      metadata: { foo: 'bar' },
      retries: 0,
    };

    prismaMock.outboxEvent.findMany.mockResolvedValue([event]);
    prismaMock.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    emitterMock.emitAsync.mockResolvedValue(undefined);
    prismaMock.outboxEvent.update.mockResolvedValue(undefined);

    await dispatcher['processPendingEvents']();

    expect(emitterMock.emitAsync).toHaveBeenCalledWith('match.created', expect.objectContaining({
      aggregateType: 'Match',
      aggregateId: 'match-id',
    }));
    expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-id' },
      data: { status: 'PUBLISHED', published_at: expect.any(Date) },
    });
  });
});
