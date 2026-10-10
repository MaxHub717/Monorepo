import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { Prisma } from '@prisma/client';
import type { PermissionName } from '../../common/authz/authz.types.js';

export type PenaltyScopeType = 'PLAYER' | 'CLUB' | 'MATCH' | 'SEASON' | 'PHASE' | 'PLOT' | 'SERIES' | 'GAME' | 'USER' | 'LEGACY';
export type PenaltyTypeValue = 'WARNING' | 'FORFEIT' | 'POINT_DEDUCTION' | 'SUSPENSION' | 'BAN' | 'DISQUALIFICATION';
export type PenaltyStatusValue = 'PROPOSED' | 'UNDER_REVIEW' | 'APPROVED' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export type PenaltyEffectTypeValue =
  | 'NONE'
  | 'POINTS_DEDUCTION'
  | 'GAME_FORFEIT'
  | 'SERIES_FORFEIT'
  | 'EXECUTION_BLOCK'
  | 'ADVANCEMENT_EXCLUSION'
  | 'COMPETITION_DISQUALIFICATION';

export type PenaltyEffectTargetType = Exclude<PenaltyScopeType, 'LEGACY'>;

export interface PenaltyActor {
  id?: string;
  role?: string;
  permissions?: PermissionName[];
  requestId?: string;
}

export class CreatePenaltyDto {
  @IsIn(['PLAYER', 'CLUB', 'MATCH', 'SEASON', 'PHASE', 'PLOT', 'SERIES', 'GAME', 'USER'])
  scopeType!: PenaltyScopeType;
  @IsUUID('4')
  scopeId!: string;

  @IsOptional()
  @IsUUID('4')
  playerId?: string;

  @IsOptional()
  @IsUUID('4')
  clubId?: string;
  @IsOptional()
  @IsUUID('4')
  matchId?: string;
  @IsOptional()
  @IsUUID('4')
  disputeId?: string;

  @IsIn(['WARNING', 'FORFEIT', 'POINT_DEDUCTION', 'SUSPENSION', 'BAN', 'DISQUALIFICATION'])
  type!: PenaltyTypeValue;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  reason!: string;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  effectAmount?: number;
}

export class UpdatePenaltyStatusDto {
  @IsIn(['UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'EXPIRED', 'REVOKED'])
  status!: PenaltyStatusValue;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  reason!: string;
}

interface PenaltyScopeContext {
  scopeType: PenaltyScopeType;
  scopeId: string;
  matchId?: string;
  playerId?: string;
  clubId?: string;
  userId?: string;
  seasonId?: string;
  phaseId?: string;
  plotId?: string;
  seriesId?: string;
  gameId?: string;
  participantIds?: string[];
}

export interface PenaltyEffectContext {
  scopeId?: string | null;
  matchId?: string | null;
  playerId?: string | null;
  clubId?: string | null;
  userId?: string | null;
  seasonId?: string | null;
  phaseId?: string | null;
  plotId?: string | null;
  seriesId?: string | null;
  gameId?: string | null;
  participantIds?: string[];
  winnerPlayerId?: string | null;
}

function jsonStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      return [];
    }
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function validIdentifier(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(toPrismaJson);
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new BadRequestException('Penalty audit data must contain only JSON-safe values.');
  }

  const entries: Array<[string, Prisma.InputJsonValue | null]> = [];
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) entries.push([key, toPrismaJson(entry)]);
  }
  return Object.fromEntries(entries);
}

function legacyTarget(penalty: PenaltyEffectSource, context: PenaltyEffectContext) {
  const candidates: Array<{ type: PenaltyEffectTargetType; id: unknown }> = [
    { type: 'GAME', id: penalty.game_id ?? context.gameId },
    { type: 'SERIES', id: penalty.series_id ?? context.seriesId },
    { type: 'MATCH', id: penalty.match_id ?? context.matchId },
    { type: 'PLAYER', id: penalty.player_id ?? context.playerId },
    { type: 'CLUB', id: context.clubId },
    { type: 'USER', id: context.userId },
    { type: 'PLOT', id: context.plotId },
    { type: 'PHASE', id: context.phaseId },
    { type: 'SEASON', id: context.seasonId },
  ];
  for (const candidate of candidates) {
    const id = validIdentifier(candidate.id);
    if (id) return { type: candidate.type, id };
  }
  return undefined;
}

export function resolvePenaltyEffect(
  type: PenaltyTypeValue,
  scopeType: PenaltyScopeType,
): PenaltyEffectTypeValue {
  if (type === 'WARNING') return 'NONE';
  if (type === 'FORFEIT') return scopeType === 'GAME' ? 'GAME_FORFEIT' : 'SERIES_FORFEIT';
  if (type === 'POINT_DEDUCTION') return 'POINTS_DEDUCTION';
  if (type === 'SUSPENSION' || type === 'BAN') return 'EXECUTION_BLOCK';
  if (type === 'DISQUALIFICATION') return 'COMPETITION_DISQUALIFICATION';
  return 'NONE';
}

export type PenaltyEffectActionType =
  | 'MATCH_RESULT'
  | 'STANDINGS_ADJUSTMENT'
  | 'PLAYER_ELIGIBILITY'
  | 'PARTICIPANT_STATUS'
  | 'SERIES_RESOLUTION';

export interface PenaltyEffectAction {
  type: PenaltyEffectActionType;
  targetType: PenaltyEffectTargetType;
  targetId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  reason?: string;
}

export interface PenaltyEffectPlan {
  penaltyId: string;
  effectType: PenaltyEffectTypeValue;
  scopeType: PenaltyScopeType;
  scopeId: string;
  shouldApply: boolean;
  actions: PenaltyEffectAction[];
  audit: {
    action: 'PENALTY_EFFECT_APPLIED' | 'PENALTY_EFFECT_SKIPPED';
    effectType: PenaltyEffectTypeValue;
    penaltyId: string;
    appliedAt: string;
    reversalAllowed: boolean;
    reason: string;
  };
}

interface PenaltyEffectSource {
  id?: string | null;
  scope_type?: PenaltyScopeType | null;
  scope_id?: string | null;
  type?: PenaltyTypeValue | null;
  effect_type?: PenaltyEffectTypeValue | null;
  effect_status?: string | null;
  status?: PenaltyStatusValue | null;
  reason?: string | null;
  player_id?: string | null;
  match_id?: string | null;
  series_id?: string | null;
  game_id?: string | null;
  phase_id?: string | null;
  season_id?: string | null;
  effect_amount?: number | null;
}

export function buildPenaltyEffectPlan(
  penalty: PenaltyEffectSource,
  context: PenaltyEffectContext = {},
): PenaltyEffectPlan {
  const penaltyId = validIdentifier(penalty.id);
  if (!penaltyId) throw new BadRequestException('A valid penalty ID is required to plan its effect.');
  const scopeType = penalty.scope_type ?? 'PLAYER';
  const target = scopeType === 'LEGACY' ? legacyTarget(penalty, context) : undefined;
  const scopeId = validIdentifier(penalty.scope_id)
    ?? validIdentifier(context.scopeId)
    ?? target?.id
    ?? validIdentifier(penalty.player_id)
    ?? validIdentifier(penalty.match_id)
    ?? validIdentifier(penalty.series_id)
    ?? validIdentifier(penalty.game_id);
  if (!scopeId) throw new BadRequestException(`Penalty ${penaltyId} does not have a valid scope ID.`);
  const effectScopeType = scopeType === 'LEGACY' ? target?.type ?? 'LEGACY' : scopeType;
  const effectType = penalty.effect_type ?? resolvePenaltyEffect(penalty.type ?? 'WARNING', effectScopeType);

  if (effectType === 'NONE' || penalty.status === 'REVOKED' || penalty.status === 'EXPIRED') {
    return {
      penaltyId,
      effectType,
      scopeType,
      scopeId,
      shouldApply: false,
      actions: [],
      audit: {
        action: 'PENALTY_EFFECT_SKIPPED',
        effectType,
        penaltyId,
        appliedAt: new Date().toISOString(),
        reversalAllowed: false,
        reason: penalty.reason ?? 'No effect is required for this penalty.',
      },
    };
  }

  const legacyActionTarget = scopeType === 'LEGACY'
    ? effectType === 'GAME_FORFEIT' || effectType === 'SERIES_FORFEIT'
      ? [
          { type: 'GAME' as const, id: validIdentifier(penalty.game_id ?? context.gameId) },
          { type: 'SERIES' as const, id: validIdentifier(penalty.series_id ?? context.seriesId) },
          { type: 'MATCH' as const, id: validIdentifier(penalty.match_id ?? context.matchId) },
        ].find((candidate) => candidate.id !== null)
      : { type: 'PLAYER' as const, id: validIdentifier(penalty.player_id ?? context.playerId) }
    : { type: scopeType, id: scopeId };
  if (!legacyActionTarget?.id) {
    return {
      penaltyId,
      effectType,
      scopeType,
      scopeId,
      shouldApply: false,
      actions: [],
      audit: {
        action: 'PENALTY_EFFECT_SKIPPED',
        effectType,
        penaltyId,
        appliedAt: new Date().toISOString(),
        reversalAllowed: false,
        reason: scopeType === 'LEGACY'
          ? 'Legacy penalty has no valid reference for a supported effect target.'
          : 'Penalty effect has no valid target ID.',
      },
    };
  }

  const actions: PenaltyEffectAction[] = [];
  if (effectType === 'GAME_FORFEIT' || effectType === 'SERIES_FORFEIT') {
    const targetId = validIdentifier(penalty.game_id ?? context.gameId)
      ?? validIdentifier(penalty.series_id ?? context.seriesId)
      ?? validIdentifier(penalty.match_id ?? context.matchId)
      ?? (scopeType === 'LEGACY' ? null : scopeId);
    if (!targetId) {
      throw new BadRequestException(`Penalty ${penaltyId} has no valid Game, Series, or Match target.`);
    }
    actions.push({
      type: 'MATCH_RESULT',
      targetType: scopeType === 'LEGACY' ? legacyActionTarget.type : scopeType,
      targetId,
      beforeState: { status: 'PENDING' },
      afterState: {
        status: effectType === 'GAME_FORFEIT' ? 'FORFEITED' : 'COMPLETED',
        winnerPlayerId: validIdentifier(context.winnerPlayerId),
      },
      reason: penalty.reason ?? 'Penalty effect applied',
    });
  }

  if (effectType === 'POINTS_DEDUCTION') {
    const delta = Number.isFinite(penalty.effect_amount) ? -(penalty.effect_amount as number) : -0;
    actions.push({
      type: 'STANDINGS_ADJUSTMENT',
      targetType: legacyActionTarget.type,
      targetId: legacyActionTarget.id,
      beforeState: { points: 0 },
      afterState: { points: delta },
      reason: penalty.reason ?? 'Points deductions are applied to standings.',
    });
  }

  if (effectType === 'EXECUTION_BLOCK') {
    actions.push({
      type: 'PLAYER_ELIGIBILITY',
      targetType: legacyActionTarget.type,
      targetId: legacyActionTarget.id,
      beforeState: { eligible: true },
      afterState: { eligible: false, status: 'SUSPENDED' },
      reason: penalty.reason ?? 'Competitive participation is suspended.',
    });
  }

  if (effectType === 'ADVANCEMENT_EXCLUSION') {
    actions.push({
      type: 'PARTICIPANT_STATUS',
      targetType: legacyActionTarget.type,
      targetId: legacyActionTarget.id,
      beforeState: { advancementEligible: true },
      afterState: { advancementEligible: false },
      reason: penalty.reason ?? 'Advancement eligibility removed.',
    });
  }

  if (effectType === 'COMPETITION_DISQUALIFICATION') {
    actions.push({
      type: 'PLAYER_ELIGIBILITY',
      targetType: legacyActionTarget.type,
      targetId: legacyActionTarget.id,
      beforeState: { eligible: true },
      afterState: { eligible: false, status: 'BANNED' },
      reason: penalty.reason ?? 'Participant is disqualified from competition.',
    });
  }

  return {
    penaltyId,
    effectType,
    scopeType,
    scopeId,
    shouldApply: true,
    actions,
    audit: {
      action: 'PENALTY_EFFECT_APPLIED',
      effectType,
      penaltyId,
      appliedAt: new Date().toISOString(),
      reversalAllowed: true,
      reason: penalty.reason ?? 'Penalty effect applied to the target competition state.',
    },
  };
}

const PENALTY_EFFECT_BY_TYPE: Record<PenaltyTypeValue, PenaltyEffectTypeValue> = {
  WARNING: 'NONE',
  FORFEIT: 'SERIES_FORFEIT',
  POINT_DEDUCTION: 'POINTS_DEDUCTION',
  SUSPENSION: 'EXECUTION_BLOCK',
  BAN: 'EXECUTION_BLOCK',
  DISQUALIFICATION: 'COMPETITION_DISQUALIFICATION',
};

const ALLOWED_PENALTY_TRANSITIONS: Partial<Record<PenaltyStatusValue, PenaltyStatusValue[]>> = {
  PROPOSED: ['UNDER_REVIEW', 'APPROVED', 'REVOKED'],
  UNDER_REVIEW: ['APPROVED', 'REVOKED'],
  APPROVED: ['ACTIVE', 'EXPIRED', 'REVOKED'],
  ACTIVE: ['EXPIRED', 'REVOKED'],
};

@Injectable()
export class PenaltyService {
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxService) {}

  async listPenalties() {
    return this.prisma.penalty.findMany({
      include: {
        match: true,
        player: true,
        club: true,
        user: true,
        season: true,
        phase: true,
        plot: true,
        series: true,
        game: true,
        dispute: true,
        issued_by: { select: { id: true, username: true } },
        events: { orderBy: { created_at: 'asc' } },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
  }

  async getPenalty(penaltyId: string) {
    const penalty = await this.prisma.penalty.findUnique({
      where: { id: penaltyId },
      include: {
        match: true, player: true, club: true, user: true, season: true, phase: true,
        plot: true, series: true, game: true, dispute: true,
        issued_by: { select: { id: true, username: true } },
        events: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!penalty) throw new NotFoundException('Penalty not found.');
    return penalty;
  }

  async createPenalty(dto: CreatePenaltyDto, actor: PenaltyActor) {
    if (!actor.id) throw new BadRequestException('An issuing administrator is required.');
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('A penalty reason is required.');
    if (dto.type === 'POINT_DEDUCTION' && (!Number.isInteger(dto.effectAmount) || (dto.effectAmount ?? 0) < 1)) {
      throw new BadRequestException('A positive effect amount is required for a point deduction.');
    }
    if (dto.type !== 'POINT_DEDUCTION' && dto.effectAmount !== undefined) {
      throw new BadRequestException('An effect amount is only valid for a point deduction.');
    }

    const effectiveAt = dto.effectiveAt ? new Date(dto.effectiveAt) : new Date();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= effectiveAt) throw new BadRequestException('Penalty expiration must be after its effective date.');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const scope = await this.resolveScope(tx, dto.scopeType, dto.scopeId);
      if (dto.matchId && (scope.scopeType !== 'MATCH' || dto.matchId !== scope.scopeId)) {
        throw new BadRequestException('Use the Match as the penalty scope instead of a separate Match id.');
      }
      if (dto.playerId && scope.participantIds && !scope.participantIds.includes(dto.playerId)) {
        throw new BadRequestException('The affected Player is not part of the selected penalty scope.');
      }
      if (dto.scopeType === 'PLAYER' && dto.playerId && dto.playerId !== dto.scopeId) {
        throw new BadRequestException('The affected Player must match the selected penalty scope.');
      }
      if (dto.scopeType === 'CLUB' && dto.clubId && dto.clubId !== dto.scopeId) {
        throw new BadRequestException('The affected Club must match the selected penalty scope.');
      }
      if (dto.type === 'FORFEIT' && !['MATCH', 'SERIES', 'GAME'].includes(dto.scopeType)) {
        throw new BadRequestException('A forfeit penalty must target a Match, Series, or Game.');
      }
      if (dto.disputeId && !(await tx.dispute.findUnique({ where: { id: dto.disputeId }, select: { id: true } }))) {
        throw new NotFoundException('Dispute not found.');
      }
      const effectType: PenaltyEffectTypeValue = resolvePenaltyEffect(dto.type, dto.scopeType);
      const penalty = await tx.penalty.create({
        data: {
          scope_type: scope.scopeType,
          scope_id: scope.scopeId,
          match_id: scope.matchId ?? null,
          player_id: scope.playerId ?? dto.playerId ?? null,
          club_id: scope.clubId ?? dto.clubId ?? null,
          user_id: scope.userId ?? null,
          season_id: scope.seasonId ?? null,
          phase_id: scope.phaseId ?? null,
          plot_id: scope.plotId ?? null,
          series_id: scope.seriesId ?? null,
          game_id: scope.gameId ?? null,
          dispute_id: dto.disputeId ?? null,
          issued_by_id: actor.id,
          type: dto.type,
          effect_type: effectType,
          effect_status: effectType === 'NONE' ? 'NOT_APPLICABLE' : 'DECLARED_NOT_APPLIED',
          effect_amount: dto.effectAmount ?? null,
          status: 'PROPOSED',
          reason,
          issued_at: new Date(),
          effective_at: effectiveAt,
          expires_at: expiresAt,
        },
      });
      await this.recordPenaltyEvent(tx, {
        penaltyId: penalty.id,
        action: 'PENALTY_PROPOSED',
        toStatus: 'PROPOSED',
        actor,
        reason,
        metadata: { scopeType: scope.scopeType, scopeId: scope.scopeId, effectType, effectStatus: penalty.effect_status },
      });
      await this.outbox.enqueueEvent(tx, {
        eventName: 'penalty.proposed',
        aggregateType: 'Penalty',
        aggregateId: penalty.id,
        actorId: actor.id,
        actorRole: actor.role,
        correlationId: actor.requestId,
        metadata: { penaltyId: penalty.id, scopeType: scope.scopeType, scopeId: scope.scopeId, effectType },
      });
      return penalty;
    });
  }

  async updatePenaltyStatus(penaltyId: string, dto: UpdatePenaltyStatusDto, actor: PenaltyActor) {
    if (!actor.id) throw new BadRequestException('An acting administrator is required.');
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('A reason is required for every penalty status change.');
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.penalty.findUnique({ where: { id: penaltyId } });
      if (!existing) throw new NotFoundException('Penalty not found.');
      const from = existing.status as PenaltyStatusValue;
      const to = dto.status;
      if (!ALLOWED_PENALTY_TRANSITIONS[from]?.includes(to)) {
        throw new BadRequestException(`Invalid penalty transition from ${from} to ${to}.`);
      }
      if (to === 'ACTIVE') {
        const now = new Date();
        if (existing.effective_at > now) throw new BadRequestException('This penalty is not effective yet.');
        if (existing.expires_at && existing.expires_at <= now) throw new BadRequestException('This penalty has expired and cannot be activated.');
      }
      const effectStatus = to === 'REVOKED'
        ? existing.effect_type === 'NONE' ? 'NOT_APPLICABLE' : 'REVOKED'
        : to === 'EXPIRED'
          ? existing.effect_type === 'NONE' ? 'NOT_APPLICABLE' : 'EXPIRED'
          : existing.effect_status;
      const updated = await tx.penalty.update({
        where: { id: penaltyId },
        data: { status: to, effect_status: effectStatus },
      });
      await this.recordPenaltyEvent(tx, {
        penaltyId,
        action: `STATUS_${to}`,
        fromStatus: from,
        toStatus: to,
        actor,
        reason,
        metadata: { effectType: existing.effect_type, effectStatus },
      });
      await this.outbox.enqueueEvent(tx, {
        eventName: `penalty.${to.toLowerCase()}`,
        aggregateType: 'Penalty',
        aggregateId: updated.id,
        actorId: actor.id,
        actorRole: actor.role,
        correlationId: actor.requestId,
        metadata: { penaltyId: updated.id, status: updated.status, effectStatus: updated.effect_status },
      });
      return updated;
    });
  }

  async applyPenaltyEffect(penaltyId: string, actor: PenaltyActor) {
    const effectsService = new PenaltyEffectsService(this.prisma, this.outbox);
    return effectsService.applyPenaltyEffect(penaltyId, actor);
  }

  private async resolveScope(tx: Prisma.TransactionClient, scopeType: PenaltyScopeType, scopeId: string): Promise<PenaltyScopeContext> {
    if (scopeType === 'PLAYER') {
      if (!(await tx.playerProfile.findUnique({ where: { id: scopeId }, select: { id: true } }))) throw new NotFoundException('Player not found.');
      return { scopeType, scopeId, playerId: scopeId, participantIds: [scopeId] };
    }
    if (scopeType === 'USER') {
      if (!tx.user || !(await tx.user.findUnique({ where: { id: scopeId }, select: { id: true } }))) {
        throw new NotFoundException('User not found.');
      }
      return { scopeType, scopeId, userId: scopeId, participantIds: [] };
    }
    if (scopeType === 'CLUB') {
      if (!(await tx.club.findUnique({ where: { id: scopeId }, select: { id: true } }))) throw new NotFoundException('Club not found.');
      return { scopeType, scopeId, clubId: scopeId };
    }
    if (scopeType === 'MATCH') {
      const match = await tx.match.findUnique({ where: { id: scopeId }, include: { fixture: true } });
      if (!match) throw new NotFoundException('Match not found.');
      return {
        scopeType, scopeId, matchId: match.id, seasonId: match.season_id,
        participantIds: [match.fixture.home_player_id, match.fixture.away_player_id],
      };
    }
    if (scopeType === 'SEASON') {
      const season = await tx.season.findUnique({
        where: { id: scopeId },
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
      return { scopeType, scopeId, seasonId: scopeId, participantIds };
    }
    if (scopeType === 'PHASE') {
      const phase = await tx.phase.findUnique({ where: { id: scopeId }, include: { plots: { select: { player_ids: true } } } });
      if (!phase) throw new NotFoundException('Phase not found.');
      const saved = jsonStringArray(phase.participating_player_ids);
      const participantIds = saved.length > 0
        ? saved
        : Array.from(new Set(phase.plots.flatMap((plot) => jsonStringArray(plot.player_ids))));
      return { scopeType, scopeId, phaseId: phase.id, seasonId: phase.season_id, participantIds };
    }
    if (scopeType === 'PLOT') {
      const plot = await tx.plot.findUnique({ where: { id: scopeId }, include: { phase: { select: { season_id: true } } } });
      if (!plot) throw new NotFoundException('Plot not found.');
      return {
        scopeType, scopeId, plotId: plot.id, phaseId: plot.phase_id, seasonId: plot.phase.season_id,
        participantIds: jsonStringArray(plot.player_ids),
      };
    }
    if (scopeType === 'SERIES') {
      const series = await tx.series.findUnique({
        where: { id: scopeId },
        include: { games: { select: { home_player_id: true, away_player_id: true } } },
      });
      if (!series) throw new NotFoundException('Series not found.');
      const saved = jsonStringArray(series.participant_player_ids);
      const participantIds = saved.length === 2
        ? saved
        : Array.from(new Set(series.games.flatMap((game) => [game.home_player_id, game.away_player_id]).filter((id): id is string => Boolean(id))));
      return {
        scopeType, scopeId, seriesId: series.id, plotId: series.plot_id, phaseId: series.phase_id,
        seasonId: series.season_id, participantIds,
      };
    }
    const game = await tx.game.findUnique({
      where: { id: scopeId },
      include: { series: { include: { games: { select: { home_player_id: true, away_player_id: true } } } } },
    });
    if (!game) throw new NotFoundException('Game not found.');
    const saved = jsonStringArray(game.series.participant_player_ids);
    const participantIds = saved.length === 2
      ? saved
      : Array.from(new Set(game.series.games.flatMap((entry) => [entry.home_player_id, entry.away_player_id]).filter((id): id is string => Boolean(id))));
    return {
      scopeType, scopeId, gameId: game.id, seriesId: game.series.id, plotId: game.series.plot_id,
      phaseId: game.series.phase_id, seasonId: game.series.season_id, participantIds,
    };
  }

  private async recordPenaltyEvent(tx: Prisma.TransactionClient, input: {
    penaltyId: string;
    action: string;
    fromStatus?: PenaltyStatusValue;
    toStatus?: PenaltyStatusValue;
    actor: PenaltyActor;
    reason: string;
    metadata?: unknown;
  }) {
    const metadata = input.metadata === undefined ? undefined : toPrismaJson(input.metadata) ?? Prisma.JsonNull;
    const auditAction = input.action === 'PENALTY_PROPOSED'
      ? 'PENALTY_PENALTY_PROPOSED'
      : input.action.startsWith('PENALTY_')
        ? input.action
        : `PENALTY_${input.action}`;
    await tx.penaltyEvent.create({
      data: {
        penalty_id: input.penaltyId,
        action: input.action,
        from_status: input.fromStatus,
        to_status: input.toStatus,
        actor_id: input.actor.id,
        actor_role: input.actor.role,
        reason: input.reason,
        metadata,
      },
    });
    await tx.auditLog.create({
      data: {
        entity_type: 'Penalty',
        entity_id: input.penaltyId,
        action: auditAction,
        actor_id: input.actor.id,
        actor_role: input.actor.role,
        request_id: input.actor.requestId,
        reason: input.reason,
        before_state: input.fromStatus ? toPrismaJson({ status: input.fromStatus }) ?? Prisma.JsonNull : undefined,
        after_state: toPrismaJson({
          action: input.action,
          ...(input.toStatus ? { status: input.toStatus } : {}),
          ...(metadata === undefined ? {} : { metadata }),
        }) ?? Prisma.JsonNull,
      },
    });
  }
}

@Injectable()
export class PenaltyEffectsService {
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxService) {}

  async applyPenaltyEffect(penaltyId: string, actor: PenaltyActor) {
    const penalty = await this.prisma.penalty.findUnique({ where: { id: penaltyId } });
    if (!penalty) throw new NotFoundException('Penalty not found.');

    const allowedStatuses = ['APPROVED', 'ACTIVE'];
    if (!allowedStatuses.includes(penalty.status)) {
      throw new BadRequestException('Only approved or active penalties may apply their competition effects.');
    }

    const plan = buildPenaltyEffectPlan(penalty, {
      playerId: penalty.player_id,
      scopeId: penalty.scope_id,
      winnerPlayerId: penalty.player_id,
      matchId: penalty.match_id,
      seriesId: penalty.series_id,
      gameId: penalty.game_id,
    });

    if (!plan.shouldApply) {
      return { ...plan, actorId: actor.id ?? null };
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const playerTargetId = plan.actions.find((action) => action.type === 'PLAYER_ELIGIBILITY')?.targetId;
      if (plan.effectType === 'EXECUTION_BLOCK' && playerTargetId) {
        await tx.playerProfile.update({
          where: { id: playerTargetId },
          data: { player_status: 'SUSPENDED' },
        });
      }

      if (plan.effectType === 'COMPETITION_DISQUALIFICATION' && playerTargetId) {
        await tx.playerProfile.update({
          where: { id: playerTargetId },
          data: { player_status: 'BANNED' },
        });
        await tx.divisionParticipant?.updateMany?.({
          where: { player_id: playerTargetId },
          data: { status: 'DISQUALIFIED' },
        });
      }

      if (plan.effectType === 'POINTS_DEDUCTION') {
        const points = Math.max(0, Number(penalty.effect_amount ?? 0));
        const pointsTargetId = plan.actions.find((action) => action.type === 'STANDINGS_ADJUSTMENT')?.targetId;
        if (pointsTargetId && points > 0) {
          await tx.standingsRow?.updateMany?.({
            where: { player_id: pointsTargetId },
            data: { points: { decrement: points } },
          });
        }
      }

      const matchResultAction = plan.actions.find((action) => action.type === 'MATCH_RESULT');
      if (matchResultAction?.targetType === 'MATCH') {
        await tx.match.update({
          where: { id: matchResultAction.targetId },
          data: { status: 'FORFEITED' },
        });
      }

      if (matchResultAction?.targetType === 'SERIES') {
        await tx.series.update({
          where: { id: matchResultAction.targetId },
          data: {
            status: 'ELIMINATED',
            resolution_state: 'UNRESOLVED',
            resolution_reason: penalty.reason,
          },
        });
      }

      if (matchResultAction?.targetType === 'GAME') {
        await tx.game.update({
          where: { id: matchResultAction.targetId },
          data: { status: 'COMPLETED', result: 'HOME_WIN', winner_player_id: validIdentifier(penalty.player_id) },
        });
      }

      const updatedPenalty = await tx.penalty.update({
        where: { id: penaltyId },
        data: {
          effect_status: 'APPLIED',
          status: penalty.status === 'APPROVED' ? 'ACTIVE' : 'ACTIVE',
        },
      });

      await tx.penaltyEvent.create({
        data: {
          penalty_id: penaltyId,
          action: 'PENALTY_EFFECT_APPLIED',
          from_status: penalty.status as PenaltyStatusValue,
          to_status: updatedPenalty.status as PenaltyStatusValue,
          actor_id: actor.id,
          actor_role: actor.role,
          reason: penalty.reason,
          metadata: toPrismaJson({ effectType: plan.effectType, plan }) ?? Prisma.JsonNull,
        },
      });
      await tx.auditLog.create({
        data: {
          entity_type: 'Penalty',
          entity_id: penaltyId,
          action: 'PENALTY_EFFECT_APPLIED',
          actor_id: actor.id,
          actor_role: actor.role,
          request_id: actor.requestId,
          reason: penalty.reason,
          before_state: toPrismaJson({ status: penalty.status }) ?? Prisma.JsonNull,
          after_state: toPrismaJson({ effectType: plan.effectType, status: updatedPenalty.status, actions: plan.actions }) ?? Prisma.JsonNull,
        },
      });

      await this.outbox.enqueueEvent(tx, {
        eventName: 'penalty.effect_applied',
        aggregateType: 'Penalty',
        aggregateId: penaltyId,
        actorId: actor.id,
        actorRole: actor.role,
        correlationId: actor.requestId,
        metadata: { penaltyId, effectType: plan.effectType, scopeType: plan.scopeType },
      });

      return { ...plan, penaltyStatus: updatedPenalty.status, actorId: actor.id ?? null };
    });
  }
}
