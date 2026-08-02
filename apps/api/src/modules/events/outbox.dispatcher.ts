import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OutboxDispatcher implements OnModuleInit {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private readonly pollIntervalMs = 5000;
  private readonly batchSize = 20;
  private readonly maxRetries = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    void this.processPendingEvents();
  }

  @Interval('outbox-dispatch', 5000)
  async handleInterval() {
    await this.processPendingEvents();
  }

  private async processPendingEvents() {
    try {
      const pendingEvents = await this.prisma.outboxEvent.findMany({
        where: { status: 'PENDING' },
        orderBy: { created_at: 'asc' },
        take: this.batchSize,
      });

      for (const event of pendingEvents) {
        await this.processOutboxEvent(event);
      }
    } catch (error) {
      this.logger.error('Failed to process pending outbox events', error);
    }
  }

  private async processOutboxEvent(event: {
    id: string;
    event_name: string;
    aggregate_type: string;
    aggregate_id: string;
    actor_id?: string | null;
    actor_role?: string | null;
    correlation_id?: string | null;
    causation_id?: string | null;
    reason?: string | null;
    metadata?: any;
    retries: number;
  }) {
    const locked = await this.prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: { status: 'IN_PROGRESS' },
    });

    if (locked.count === 0) {
      return;
    }

    const payload = {
      ...(typeof event.metadata === 'object' && event.metadata !== null ? event.metadata : {}),
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      actorId: event.actor_id ?? undefined,
      actorRole: event.actor_role ?? undefined,
      correlationId: event.correlation_id ?? undefined,
      causationId: event.causation_id ?? undefined,
      reason: event.reason ?? undefined,
    };

    try {
      await this.eventEmitter.emitAsync(event.event_name, payload);
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PUBLISHED',
          published_at: new Date(),
        },
      });
      this.logger.debug(`Published outbox event ${event.event_name} (${event.id})`);
    } catch (error) {
      const retries = event.retries + 1;
      const nextStatus = retries >= this.maxRetries ? 'FAILED' : 'PENDING';
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: nextStatus,
          retries,
        },
      });
      this.logger.error(`Failed to publish outbox event ${event.event_name} (${event.id}), retry ${retries}`, error);
    }
  }
}
