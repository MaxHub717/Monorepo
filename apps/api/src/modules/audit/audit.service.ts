import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type AuditLogQuery = {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  actorRole?: string;
  action?: string;
  correlationId?: string;
  requestId?: string;
  from?: string | Date;
  to?: string | Date;
  page?: number;
  limit?: number;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizeLog(record: any) {
    return {
      id: record.id,
      entityType: record.entity_type,
      entityId: record.entity_id,
      actorId: record.actor_id,
      actorRole: record.actor_role,
      action: record.action,
      actionSource: record.action_source,
      reason: record.reason,
      requestId: record.request_id,
      correlationId: record.correlation_id,
      beforeState: record.before_state,
      afterState: record.after_state,
      metadata: record.metadata,
      createdAt: record.created_at?.toISOString?.() ?? record.created_at,
      actor: record.actor ? {
        id: record.actor.id,
        username: record.actor.username,
        email: record.actor.email,
      } : null,
    };
  }

  private buildWhere(filters: AuditLogQuery): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.entityType) where.entity_type = filters.entityType;
    if (filters.entityId) where.entity_id = filters.entityId;
    if (filters.actorId) where.actor_id = filters.actorId;
    if (filters.actorRole) where.actor_role = filters.actorRole;
    if (filters.action) where.action = filters.action;
    if (filters.correlationId) where.correlation_id = filters.correlationId;
    if (filters.requestId) where.request_id = filters.requestId;
    if (filters.from || filters.to) {
      where.created_at = {} as Prisma.DateTimeFilter;
      if (filters.from) {
        where.created_at.gte = new Date(filters.from);
      }
      if (filters.to) {
        where.created_at.lte = new Date(filters.to);
      }
    }
    return where;
  }

  async listLogs(filters: AuditLogQuery = {}) {
    const page = Number.isFinite(filters.page) && Number(filters.page) > 0 ? Number(filters.page) : 1;
    const limit = Number.isFinite(filters.limit) && Number(filters.limit) > 0 ? Number(filters.limit) : 50;
    const perPage = Math.min(limit, 200);
    const skip = (page - 1) * perPage;
    const where = this.buildWhere(filters);

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: perPage,
        include: { actor: { select: { id: true, username: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: entries.map((entry) => this.normalizeLog(entry)),
      total,
      page,
      perPage,
      hasMore: skip + entries.length < total,
    };
  }

  async getEntityHistory(entityType: string, entityId: string, filters: Omit<AuditLogQuery, 'entityType' | 'entityId'> = {}) {
    const entries = await this.prisma.auditLog.findMany({
      where: { entity_type: entityType, entity_id: entityId, ...this.buildWhere(filters) },
      orderBy: { created_at: 'desc' },
      include: { actor: { select: { id: true, username: true, email: true } } },
    });

    return {
      entityType,
      entityId,
      total: entries.length,
      items: entries.map((entry) => this.normalizeLog(entry)),
    };
  }

  async getActorHistory(actorId: string, filters: Omit<AuditLogQuery, 'actorId'> = {}) {
    const entries = await this.prisma.auditLog.findMany({
      where: { actor_id: actorId, ...this.buildWhere(filters) },
      orderBy: { created_at: 'desc' },
      include: { actor: { select: { id: true, username: true, email: true } } },
    });

    return {
      actorId,
      total: entries.length,
      items: entries.map((entry) => this.normalizeLog(entry)),
    };
  }

  async getAuditLogEntry(logId: string) {
    const entry = await this.prisma.auditLog.findUnique({
      where: { id: logId },
      include: { actor: { select: { id: true, username: true, email: true } } },
    });
    if (!entry) {
      throw new NotFoundException(`Audit log ${logId} was not found.`);
    }
    return this.normalizeLog(entry);
  }

  async getCompetitionTimeline(seasonId: string, filters: Omit<AuditLogQuery, 'entityType' | 'entityId'> = {}) {
    const entries = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entity_type: 'Season', entity_id: seasonId },
          { correlation_id: seasonId },
          { metadata: { path: ['seasonId'], equals: seasonId } },
          { metadata: { path: ['season_id'], equals: seasonId } },
        ],
        ...this.buildWhere(filters),
      },
      orderBy: { created_at: 'desc' },
      include: { actor: { select: { id: true, username: true, email: true } } },
    });

    return {
      seasonId,
      total: entries.length,
      items: entries.map((entry) => this.normalizeLog(entry)),
    };
  }

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
