import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async writeLog(input: {
    entityType: string;
    entityId: string;
    action: string;
    actorId?: string;
    actorRole?: string;
    actionSource?: string;
    beforeState?: unknown;
    afterState?: unknown;
    reason?: string;
    requestId?: string;
    correlationId?: string;
    metadata?: unknown;
    isOverride?: boolean;
  }) {
    if (input.isOverride && !input.reason) {
      throw new Error('Override audit entries require a reason');
    }

    await this.prisma.auditLog.create({
      data: {
        entity_type: input.entityType,
        entity_id: input.entityId,
        action: input.action,
        actor_id: input.actorId,
        actor_role: input.actorRole,
        action_source: input.actionSource,
        before_state: input.beforeState as any,
        after_state: input.afterState as any,
        reason: input.reason,
        request_id: input.requestId,
        correlation_id: input.correlationId,
        metadata: input.metadata as any,
      },
    });
    this.logger.debug(`Audit log written for ${input.entityType}:${input.entityId}`);
  }

  async writeOverride(input: {
    entityType: string;
    entityId: string;
    action: string;
    actorId?: string;
    actorRole?: string;
    actionSource: string;
    beforeState?: unknown;
    afterState?: unknown;
    reason: string;
    requestId?: string;
    correlationId?: string;
    metadata?: unknown;
  }) {
    return this.writeLog({ ...input, isOverride: true });
  }
}
