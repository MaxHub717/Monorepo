import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { createCompetitionNotifications } from '../notification/notification.service.js';
import { Prisma } from '@prisma/client';

export type DisputeTargetType = 'MATCH' | 'SEASON' | 'PHASE' | 'PLOT' | 'SERIES' | 'GAME';
export type DisputeAction = 'RESOLVE' | 'REJECT' | 'ESCALATE';
type DisputeStatusValue = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'ESCALATED' | 'RESOLVED' | 'REJECTED' | 'CLOSED';

export interface DisputeActor {
  id?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  requestId?: string;
}

export class CreateDisputeDto {
  @IsOptional()
  @IsIn(['MATCH', 'SEASON', 'PHASE', 'PLOT', 'SERIES', 'GAME'])
  targetType?: DisputeTargetType;

  @IsOptional()
  @IsUUID('4')
  targetId?: string;

  // Kept for existing Match/Fixture integrations.
  @IsOptional()
  @IsUUID('4')
  matchId?: string;

  @IsOptional()
  @IsUUID('4')
  clubId?: string;

  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  issue!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  evidenceUrls?: string[];
}

export class AddDisputeEvidenceDto {
  @IsUrl()
  resourceUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class AssignDisputeDto {
  @IsUUID('4')
  reviewerId!: string;
}

export class DisputeInvestigationNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  note!: string;
}

export class DisputeDecisionDto {
  @IsIn(['RESOLVE', 'REJECT', 'ESCALATE'])
  action!: DisputeAction;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  reason!: string;
}

export class CloseDisputeDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}

interface DisputeTargetContext {
  targetType: DisputeTargetType;
  targetId: string;
  matchId?: string;
  seasonId?: string;
  phaseId?: string;
  plotId?: string;
  seriesId?: string;
  gameId?: string;
  participantIds: string[];
}

function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

const DISPUTE_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['ESCALATED', 'RESOLVED', 'REJECTED'],
  ESCALATED: ['UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
  RESOLVED: ['CLOSED'],
  REJECTED: ['CLOSED'],
};

@Injectable()
export class DisputeService {
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxService) {}

  async listDisputes() {
    return this.prisma.dispute.findMany({
      include: {
        match: true,
        season: true,
        phase: true,
        plot: true,
        series: true,
        game: true,
        player: true,
        user: true,
        assigned_reviewer: { select: { id: true, username: true } },
        evidence: { orderBy: { created_at: 'asc' } },
        events: { orderBy: { created_at: 'asc' } },
      },
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
    });
  }

  async getDispute(disputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        match: true,
        season: true,
        phase: true,
        plot: true,
        series: true,
        game: true,
        player: true,
        user: true,
        assigned_reviewer: { select: { id: true, username: true } },
        evidence: { orderBy: { created_at: 'asc' } },
        events: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found.');
    return dispute;
  }

  async createDispute(dto: CreateDisputeDto, actor: DisputeActor) {
    const targetType = dto.targetType ?? (dto.matchId ? 'MATCH' : undefined);
    const targetId = dto.targetId ?? dto.matchId;
    if (!targetType || !targetId) throw new BadRequestException('A dispute target type and target id are required.');
    const issue = dto.issue.trim();
    if (!issue) throw new BadRequestException('A dispute reason is required.');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const target = await this.resolveTarget(tx, targetType, targetId);
      const canManage = actor.permissions?.includes('MANAGE_DISPUTES') ?? false;
      const profile = actor.id
        ? await tx.playerProfile.findUnique({ where: { user_id: actor.id }, select: { id: true } })
        : null;
      if (!canManage && (!profile || !target.participantIds.includes(profile.id))) {
        throw new ForbiddenException('Only a participant in the selected competition target may submit this dispute.');
      }

      const dispute = await tx.dispute.create({
        data: {
          target_type: target.targetType,
          target_id: target.targetId,
          match_id: target.matchId ?? null,
          season_id: target.seasonId ?? null,
          phase_id: target.phaseId ?? null,
          plot_id: target.plotId ?? null,
          series_id: target.seriesId ?? null,
          game_id: target.gameId ?? null,
          player_id: profile?.id ?? null,
          club_id: dto.clubId ?? null,
          user_id: actor.id,
          issue,
          status: 'SUBMITTED',
          submitted_at: new Date(),
          evidence: {
            create: (dto.evidenceUrls ?? []).map((resource_url) => ({
              resource_url,
              submitted_by_id: actor.id,
            })),
          },
        },
      });
      await this.recordEvent(tx, {
        disputeId: dispute.id,
        action: 'SUBMITTED',
        toStatus: 'SUBMITTED',
        actor,
        reason: issue,
        metadata: { targetType: target.targetType, targetId: target.targetId, evidenceCount: dto.evidenceUrls?.length ?? 0 },
      });
      await this.outbox.enqueueEvent(tx, {
        eventName: 'dispute.submitted',
        aggregateType: 'Dispute',
        aggregateId: dispute.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.requestId,
        metadata: { disputeId: dispute.id, targetType: target.targetType, targetId: target.targetId },
      });
      if (target.targetType !== 'MATCH' && target.participantIds.length > 0) {
        const targetLabel = target.targetType === 'SERIES' || target.targetType === 'GAME'
          ? 'a Series'
          : target.targetType === 'PHASE'
            ? 'a Phase'
            : target.targetType === 'PLOT'
              ? 'a Plot in a Phase'
              : 'a Season';
        await createCompetitionNotifications(tx, {
          playerIds: target.participantIds,
          eventType: 'DISPUTE_OPENED',
          eventKey: `dispute-opened:${dispute.id}`,
          title: 'Competition dispute opened',
          message: `A dispute has been opened for ${targetLabel} competition matter.`,
          relatedEntity: `Dispute:${dispute.id}`,
        });
      }
      return dispute;
    });
  }

  async addEvidence(disputeId: string, dto: AddDisputeEvidenceDto, actor: DisputeActor) {
    return this.prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.findUnique({ where: { id: disputeId } });
      if (!dispute) throw new NotFoundException('Dispute not found.');
      if (['RESOLVED', 'REJECTED', 'CLOSED'].includes(dispute.status)) {
        throw new BadRequestException('Evidence cannot be added after a dispute decision.');
      }
      await this.assertDisputeParticipantOrManager(tx, dispute, actor);
      const evidence = await tx.disputeEvidence.create({
        data: {
          dispute_id: disputeId,
          submitted_by_id: actor.id,
          resource_url: dto.resourceUrl,
          description: dto.description?.trim() || null,
        },
      });
      await this.recordEvent(tx, {
        disputeId,
        action: 'EVIDENCE_ADDED',
        fromStatus: dispute.status,
        toStatus: dispute.status,
        actor,
        reason: dto.description,
        metadata: { evidenceId: evidence.id, resourceUrl: evidence.resource_url },
      });
      return evidence;
    });
  }

  async assignReviewer(disputeId: string, reviewerId: string, actor: DisputeActor) {
    return this.prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.findUnique({ where: { id: disputeId } });
      if (!dispute) throw new NotFoundException('Dispute not found.');
      if (!['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'].includes(dispute.status)) {
        throw new BadRequestException('Only an open dispute can be assigned.');
      }
      const reviewer = await tx.user.findUnique({ where: { id: reviewerId }, select: { id: true, deleted_at: true } });
      if (!reviewer || reviewer.deleted_at) throw new NotFoundException('Reviewer not found.');
      const nextStatus = dispute.status === 'SUBMITTED' ? 'UNDER_REVIEW' : dispute.status;
      const updated = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          assigned_reviewer_id: reviewerId,
          status: nextStatus,
          reviewed_at: dispute.reviewed_at ?? new Date(),
        },
      });
      await this.recordEvent(tx, {
        disputeId,
        action: 'REVIEWER_ASSIGNED',
        fromStatus: dispute.status,
        toStatus: nextStatus,
        actor,
        metadata: { reviewerId },
      });
      await this.enqueueStatusEvent(tx, updated, 'dispute.assigned', actor);
      return updated;
    });
  }

  async addInvestigationNote(disputeId: string, note: string, actor: DisputeActor) {
    return this.prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.findUnique({ where: { id: disputeId } });
      if (!dispute) throw new NotFoundException('Dispute not found.');
      if (!['UNDER_REVIEW', 'ESCALATED'].includes(dispute.status)) {
        throw new BadRequestException('Investigation notes require an open review.');
      }
      await this.recordEvent(tx, {
        disputeId,
        action: 'INVESTIGATION_NOTE_ADDED',
        fromStatus: dispute.status,
        toStatus: dispute.status,
        actor,
        reason: note.trim(),
      });
      await this.outbox.enqueueEvent(tx, {
        eventName: 'dispute.investigation_note_added',
        aggregateType: 'Dispute',
        aggregateId: disputeId,
        actorId: actor.id,
        actorRole: actor.role,
        correlationId: actor.requestId,
        metadata: { disputeId, note: note.trim() },
      });
      return { disputeId, status: dispute.status, note: note.trim() };
    });
  }

  async decideDispute(disputeId: string, action: DisputeAction, reason: string, actor: DisputeActor) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new BadRequestException('A reason is required for every dispute decision.');
    return this.prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.findUnique({ where: { id: disputeId } });
      if (!dispute) throw new NotFoundException('Dispute not found.');
      if (!['UNDER_REVIEW', 'ESCALATED'].includes(dispute.status)) {
        throw new BadRequestException('A dispute must be under review before a decision.');
      }
      const nextStatus = action === 'RESOLVE' ? 'RESOLVED' : action === 'REJECT' ? 'REJECTED' : 'ESCALATED';
      const updated = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: nextStatus,
          decision: action,
          resolution: action === 'RESOLVE' ? normalizedReason : dispute.resolution,
          resolution_reason: normalizedReason,
          resolved_at: action === 'ESCALATE' ? null : new Date(),
        },
      });
      await this.recordEvent(tx, {
        disputeId,
        action: `DECISION_${action}`,
        fromStatus: dispute.status,
        toStatus: nextStatus,
        actor,
        reason: normalizedReason,
      });
      await this.enqueueStatusEvent(tx, updated, `dispute.${nextStatus.toLowerCase()}`, actor);
      if (action === 'RESOLVE' || action === 'REJECT') {
        const playerIds = dispute.player_id ? [dispute.player_id] : [];
        if (dispute.series_id) {
          const series = await tx.series.findUnique({
              where: { id: dispute.series_id },
              select: { participant_player_ids: true },
          });
          playerIds.push(...jsonStringArray(series?.participant_player_ids));
        } else if (dispute.plot_id) {
          const plot = await tx.plot.findUnique({
            where: { id: dispute.plot_id },
            select: { player_ids: true },
          });
          playerIds.push(...jsonStringArray(plot?.player_ids));
        } else if (dispute.phase_id) {
          const phase = await tx.phase.findUnique({
            where: { id: dispute.phase_id },
            select: { participating_player_ids: true, plots: { select: { player_ids: true } } },
          });
          playerIds.push(
            ...jsonStringArray(phase?.participating_player_ids),
            ...(phase?.plots.flatMap((plot) => jsonStringArray(plot.player_ids)) ?? []),
          );
        } else if (dispute.season_id) {
          const participants = await tx.divisionParticipant.findMany({
            where: { season_id: dispute.season_id, status: 'ACTIVE' },
            select: { player_id: true },
          });
          playerIds.push(...participants.map((participant) => participant.player_id));
        }
        await createCompetitionNotifications(tx, {
          playerIds,
          eventType: 'DISPUTE_RESOLVED',
          eventKey: `dispute-resolved:${dispute.id}`,
          title: 'Competition dispute resolved',
          message: `A competition dispute has been ${action === 'RESOLVE' ? 'resolved' : 'decided'}: ${normalizedReason}`,
          relatedEntity: `Dispute:${dispute.id}`,
        });
      }
      return updated;
    });
  }

  async closeDispute(disputeId: string, reason: string | undefined, actor: DisputeActor) {
    return this.prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.findUnique({ where: { id: disputeId } });
      if (!dispute) throw new NotFoundException('Dispute not found.');
      if (!['RESOLVED', 'REJECTED'].includes(dispute.status)) {
        throw new BadRequestException('Only a resolved or rejected dispute can be closed.');
      }
      const updated = await tx.dispute.update({ where: { id: disputeId }, data: { status: 'CLOSED' } });
      await this.recordEvent(tx, {
        disputeId,
        action: 'CLOSED',
        fromStatus: dispute.status,
        toStatus: 'CLOSED',
        actor,
        reason: reason?.trim() || dispute.resolution_reason || undefined,
      });
      await this.enqueueStatusEvent(tx, updated, 'dispute.closed', actor);
      return updated;
    });
  }

  private isManager(actor: DisputeActor) {
    return actor.permissions?.includes('MANAGE_DISPUTES') ?? false;
  }

  private async assertDisputeParticipantOrManager(tx: Prisma.TransactionClient, dispute: { user_id: string | null; player_id: string | null }, actor: DisputeActor) {
    if (this.isManager(actor) || (actor.id && dispute.user_id === actor.id)) return;
    const profile = actor.id
      ? await tx.playerProfile.findUnique({ where: { user_id: actor.id }, select: { id: true } })
      : null;
    if (!profile || profile.id !== dispute.player_id) {
      throw new ForbiddenException('Only the submitting participant or a dispute manager may add evidence.');
    }
  }

  private async resolveTarget(tx: Prisma.TransactionClient, targetType: DisputeTargetType, targetId: string): Promise<DisputeTargetContext> {
    if (targetType === 'MATCH') {
      const match = await tx.match.findUnique({ where: { id: targetId }, include: { fixture: true } });
      if (!match) throw new NotFoundException('Match not found.');
      return { targetType, targetId, matchId: match.id, seasonId: match.season_id, participantIds: [match.fixture.home_player_id, match.fixture.away_player_id] };
    }
    if (targetType === 'GAME') {
      const game = await tx.game.findUnique({
        where: { id: targetId },
        include: { series: { select: { id: true, season_id: true, phase_id: true, plot_id: true, participant_player_ids: true, games: { select: { home_player_id: true, away_player_id: true } } } } },
      });
      if (!game) throw new NotFoundException('Game not found.');
      const participants = jsonStringArray(game.series.participant_player_ids);
      const participantIds = participants.length === 2
        ? participants
        : Array.from(new Set(game.series.games.flatMap((entry) => [entry.home_player_id, entry.away_player_id]).filter((id): id is string => Boolean(id))));
      return {
        targetType, targetId, gameId: game.id, seriesId: game.series.id,
        seasonId: game.series.season_id, phaseId: game.series.phase_id, plotId: game.series.plot_id, participantIds,
      };
    }
    if (targetType === 'SERIES') {
      const series = await tx.series.findUnique({
        where: { id: targetId },
        include: { games: { select: { home_player_id: true, away_player_id: true } } },
      });
      if (!series) throw new NotFoundException('Series not found.');
      const saved = jsonStringArray(series.participant_player_ids);
      const participantIds = saved.length === 2
        ? saved
        : Array.from(new Set(series.games.flatMap((entry) => [entry.home_player_id, entry.away_player_id]).filter((id): id is string => Boolean(id))));
      return { targetType, targetId, seriesId: series.id, seasonId: series.season_id, phaseId: series.phase_id, plotId: series.plot_id, participantIds };
    }
    if (targetType === 'PLOT') {
      const plot = await tx.plot.findUnique({ where: { id: targetId }, include: { phase: { select: { season_id: true } } } });
      if (!plot) throw new NotFoundException('Plot not found.');
      return { targetType, targetId, plotId: plot.id, phaseId: plot.phase_id, seasonId: plot.phase.season_id, participantIds: jsonStringArray(plot.player_ids) };
    }
    if (targetType === 'PHASE') {
      const phase = await tx.phase.findUnique({ where: { id: targetId }, include: { plots: { select: { player_ids: true } } } });
      if (!phase) throw new NotFoundException('Phase not found.');
      const saved = jsonStringArray(phase.participating_player_ids);
      const participantIds = saved.length > 0
        ? saved
        : Array.from(new Set(phase.plots.flatMap((plot) => jsonStringArray(plot.player_ids))));
      return { targetType, targetId, phaseId: phase.id, seasonId: phase.season_id, participantIds };
    }
    const season = await tx.season.findUnique({
      where: { id: targetId },
      include: { participants: { select: { player_id: true } }, phases: { select: { participating_player_ids: true, plots: { select: { player_ids: true } } } } },
    });
    if (!season) throw new NotFoundException('Season not found.');
    const participantIds = Array.from(new Set([
      ...season.participants.map((participant) => participant.player_id),
      ...season.phases.flatMap((phase) => [
        ...jsonStringArray(phase.participating_player_ids),
        ...phase.plots.flatMap((plot) => jsonStringArray(plot.player_ids)),
      ]),
    ]));
    return { targetType, targetId, seasonId: season.id, participantIds };
  }

  private async recordEvent(tx: Prisma.TransactionClient, input: {
    disputeId: string;
    action: string;
    fromStatus?: string;
    toStatus?: string;
    actor: DisputeActor;
    reason?: string;
    metadata?: unknown;
  }) {
    const metadata = input.metadata === undefined ? undefined : input.metadata as Prisma.InputJsonValue;
    await tx.disputeEvent.create({
      data: {
        dispute_id: input.disputeId,
        action: input.action,
        from_status: input.fromStatus as DisputeStatusValue | undefined,
        to_status: input.toStatus as DisputeStatusValue | undefined,
        actor_id: input.actor.id,
        actor_role: input.actor.role,
        reason: input.reason,
        metadata,
      },
    });
    await tx.auditLog.create({
      data: {
        entity_type: 'Dispute',
        entity_id: input.disputeId,
        action: `DISPUTE_${input.action}`,
        actor_id: input.actor.id,
        actor_role: input.actor.role,
        request_id: input.actor.requestId,
        reason: input.reason,
        before_state: input.fromStatus ? { status: input.fromStatus } : undefined,
        after_state: input.toStatus
          ? { status: input.toStatus, action: input.action, ...(metadata === undefined ? {} : { metadata }) }
          : { action: input.action, ...(metadata === undefined ? {} : { metadata }) },
      },
    });
  }

  private async enqueueStatusEvent(tx: Prisma.TransactionClient, dispute: { id: string; status: string }, eventName: string, actor: DisputeActor) {
    await this.outbox.enqueueEvent(tx, {
      eventName,
      aggregateType: 'Dispute',
      aggregateId: dispute.id,
      actorId: actor.id,
      actorRole: actor.role,
      correlationId: actor.requestId,
      metadata: { disputeId: dispute.id, status: dispute.status },
    });
  }
}
