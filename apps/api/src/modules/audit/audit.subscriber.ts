import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditService } from './audit.service.js';

@Injectable()
export class AuditSubscriber {
  private readonly logger = new Logger(AuditSubscriber.name);

  constructor(private readonly auditService: AuditService) {}

  @OnEvent('**', { async: true })
  async handleDomainEvent(eventName: string, payload: any) {
    if (!eventName || eventName.startsWith('outbox.')) {
      return;
    }

    try {
      await this.auditService.writeLog({
        entityType: payload?.aggregateType ?? 'unknown',
        entityId: payload?.aggregateId ?? 'unknown',
        action: eventName,
        actorId: payload?.actorId,
        actorRole: payload?.actorRole,
        actionSource: payload?.source,
        beforeState: payload?.beforeState,
        afterState: payload?.afterState,
        correlationId: payload?.correlationId,
        requestId: payload?.requestId,
        reason: payload?.reason,
        metadata: payload,
      });
    } catch (error) {
      this.logger.error(`Failed to persist audit log for event ${eventName}`, error);
    }
  }
}
