import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AssignLeagueOperatorDto, CreateLeagueDto, UpdateLeagueDto } from './dto/league.dto.js';

export interface LeagueActor {
  id?: string;
  role?: string;
  correlationId?: string;
}

@Injectable()
export class AdminLeagueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async listLeagues() {
    return this.prisma.league.findMany({
      where: { deleted_at: null },
      include: {
        _count: { select: { seasons: true, operators: true } },
        seasons: {
          select: { id: true, name: true, status: true, start_date: true, end_date: true },
          orderBy: { created_at: 'desc' },
          take: 5,
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getLeague(leagueId: string) {
    const league = await this.prisma.league.findFirst({
      where: { id: leagueId, deleted_at: null },
      include: {
        operators: { include: { user: { select: { id: true, email: true, username: true } } } },
        seasons: {
          include: { _count: { select: { divisions: true, participants: true, matches: true } } },
          orderBy: { created_at: 'desc' },
        },
      },
    });
    if (!league) throw new NotFoundException('League not found');
    return league;
  }

  async createLeague(dto: CreateLeagueDto, actor?: LeagueActor) {
    const league = await this.prisma.$transaction(async (tx) => {
      const created = await tx.league.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          region: dto.region?.trim() || null,
          metadata_json: dto.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      await this.outbox.enqueueEvent(tx, {
        eventName: 'league.created',
        aggregateType: 'League',
        aggregateId: created.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId,
        metadata: { league: created },
      });
      return created;
    });
    await this.writeAudit('League', league.id, 'created', actor, undefined, league);
    return league;
  }

  async updateLeague(leagueId: string, dto: UpdateLeagueDto, actor?: LeagueActor) {
    const before = await this.prisma.league.findFirst({ where: { id: leagueId, deleted_at: null } });
    if (!before) throw new NotFoundException('League not found');
    if (before.status === 'ARCHIVED' && dto.status !== 'ARCHIVED') {
      throw new BadRequestException('Archived leagues cannot be reactivated');
    }

    const updated = await this.prisma.league.update({
      where: { id: leagueId },
      data: {
        name: dto.name?.trim(),
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        region: dto.region === undefined ? undefined : dto.region?.trim() || null,
        metadata_json: dto.metadata === undefined ? undefined : dto.metadata as Prisma.InputJsonValue,
        status: dto.status as Prisma.LeagueUpdateInput['status'],
      },
    });
    await this.writeAudit('League', leagueId, 'updated', actor, before, updated);
    return updated;
  }

  async deleteLeague(leagueId: string, actor?: LeagueActor) {
    const before = await this.prisma.league.findFirst({ where: { id: leagueId, deleted_at: null }, include: { _count: { select: { seasons: true } } } });
    if (!before) throw new NotFoundException('League not found');
    if (before._count.seasons > 0) throw new BadRequestException('A league with seasons cannot be deleted; archive it instead');
    const updated = await this.prisma.league.update({ where: { id: leagueId }, data: { status: 'ARCHIVED', deleted_at: new Date() } });
    await this.writeAudit('League', leagueId, 'archived', actor, before, updated);
    return updated;
  }

  async assignOperator(leagueId: string, dto: AssignLeagueOperatorDto, actor?: LeagueActor) {
    await this.ensureActiveLeague(leagueId);
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: { user_roles: { include: { role: true } }, operator_profile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const isOperator = user.user_roles.some(({ role }) => ['OPERATOR', 'COMMISSIONER', 'HQ_ADMIN'].includes(role.name));
    if (!isOperator) throw new BadRequestException('User must have an operator, commissioner, or HQ admin role');
    if (dto.assignedDivisionId && user.operator_profile?.assigned_division_id && dto.assignedDivisionId !== user.operator_profile.assigned_division_id) {
      throw new BadRequestException('Assigned division does not match the user operator scope');
    }

    const assignment = await this.prisma.leagueOperator.upsert({
      where: { league_id_user_id: { league_id: leagueId, user_id: dto.userId } },
      create: { league_id: leagueId, user_id: dto.userId, region: dto.region ?? user.operator_profile?.region, assigned_division_id: dto.assignedDivisionId ?? user.operator_profile?.assigned_division_id },
      update: { region: dto.region ?? user.operator_profile?.region, assigned_division_id: dto.assignedDivisionId ?? user.operator_profile?.assigned_division_id },
      include: { user: { select: { id: true, email: true, username: true } } },
    });
    await this.writeAudit('League', leagueId, 'operator_assigned', actor, undefined, assignment);
    return assignment;
  }

  async removeOperator(leagueId: string, userId: string, actor?: LeagueActor) {
    const assignment = await this.prisma.leagueOperator.findUnique({ where: { league_id_user_id: { league_id: leagueId, user_id: userId } } });
    if (!assignment) throw new NotFoundException('League operator assignment not found');
    await this.prisma.leagueOperator.delete({ where: { id: assignment.id } });
    await this.writeAudit('League', leagueId, 'operator_removed', actor, assignment, undefined);
    return { deleted: true };
  }

  private async ensureActiveLeague(leagueId: string) {
    const league = await this.prisma.league.findFirst({ where: { id: leagueId, deleted_at: null } });
    if (!league) throw new NotFoundException('League not found');
    if (league.status !== 'ACTIVE') throw new BadRequestException('Only active leagues can receive operator assignments');
    return league;
  }

  private async writeAudit(entityType: string, entityId: string, action: string, actor?: LeagueActor, beforeState?: unknown, afterState?: unknown) {
    try {
      await this.audit.writeLog({ entityType, entityId, action, actorId: actor?.id, actorRole: actor?.role, correlationId: actor?.correlationId, beforeState, afterState });
    } catch {
      // Audit persistence must not undo a completed league operation.
    }
  }
}