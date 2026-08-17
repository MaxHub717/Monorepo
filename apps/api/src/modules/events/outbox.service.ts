import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface OutboxEventInput {
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  actorId?: string;
  actorRole?: string;
  correlationId?: string;
  causationId?: string;
  reason?: string;
  metadata?: unknown;
  version?: number;
}

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueEvent(
    tx: Prisma.TransactionClient,
    data: OutboxEventInput,
  )
  {
    return tx.outboxEvent.create({
      data: {
        event_name: data.eventName,
        aggregate_type: data.aggregateType,
        aggregate_id: data.aggregateId,
        actor_id: data.actorId,
        actor_role: data.actorRole,
        correlation_id: data.correlationId,
        causation_id: data.causationId,
        reason: data.reason,
        metadata: data.metadata as any,
        version: data.version ?? 1,
        status: 'PENDING',
      },
    });
  }

  async enqueueEventDirect(data: OutboxEventInput) {
    return this.prisma.outboxEvent.create({
      data: {
        event_name: data.eventName,
        aggregate_type: data.aggregateType,
        aggregate_id: data.aggregateId,
        actor_id: data.actorId,
        actor_role: data.actorRole,
        correlation_id: data.correlationId,
        causation_id: data.causationId,
        reason: data.reason,
        metadata: data.metadata as any,
        version: data.version ?? 1,
        status: 'PENDING',
      },
    });
  }
}
