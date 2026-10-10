import { describe, expect, it, vi } from 'vitest';
import {
  PenaltyEffectsService,
  PenaltyService,
  buildPenaltyEffectPlan,
  resolvePenaltyEffect,
} from './penalty.service.js';

const playerId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const seasonId = '30000000-0000-4000-8000-000000000001';
const phaseId = '40000000-0000-4000-8000-000000000001';
const plotId = '50000000-0000-4000-8000-000000000001';
const seriesId = '60000000-0000-4000-8000-000000000001';
const gameId = '70000000-0000-4000-8000-000000000001';
const penaltyId = '80000000-0000-4000-8000-000000000001';

function createPenaltyServiceFixture() {
  const penalty = {
    id: penaltyId,
    scope_type: 'GAME',
    scope_id: gameId,
    game_id: gameId,
    series_id: seriesId,
    plot_id: plotId,
    phase_id: phaseId,
    season_id: seasonId,
    player_id: playerId,
    type: 'SUSPENSION',
    effect_type: 'EXECUTION_BLOCK',
    effect_status: 'DECLARED_NOT_APPLIED',
    effect_amount: null,
    status: 'PROPOSED',
    reason: 'Operator-reviewed suspension',
    issued_by_id: userId,
  };
  const tx = {
    playerProfile: { findUnique: vi.fn().mockResolvedValue({ id: playerId }) },
    club: { findUnique: vi.fn().mockResolvedValue({ id: 'club-1' }) },
    match: { findUnique: vi.fn().mockResolvedValue({ id: 'match-1', season_id: seasonId, fixture: { home_player_id: playerId, away_player_id: 'other-player' } }) },
    season: { findUnique: vi.fn().mockResolvedValue({
      id: seasonId,
      participants: [{ player_id: playerId }],
      phases: [],
    }) },
    phase: { findUnique: vi.fn().mockResolvedValue({ id: phaseId, season_id: seasonId, participating_player_ids: [playerId], plots: [] }) },
    plot: { findUnique: vi.fn().mockResolvedValue({ id: plotId, phase_id: phaseId, player_ids: [playerId], phase: { season_id: seasonId } }) },
    series: { findUnique: vi.fn().mockResolvedValue({
      id: seriesId,
      season_id: seasonId,
      phase_id: phaseId,
      plot_id: plotId,
      participant_player_ids: [playerId, 'other-player'],
      games: [],
    }) },
    game: { findUnique: vi.fn().mockResolvedValue({
      id: gameId,
      series: {
        id: seriesId,
        season_id: seasonId,
        phase_id: phaseId,
        plot_id: plotId,
        participant_player_ids: [playerId, 'other-player'],
        games: [],
      },
    }) },
    dispute: { findUnique: vi.fn().mockResolvedValue({ id: 'dispute-1' }) },
    penalty: {
      create: vi.fn().mockResolvedValue(penalty),
      findUnique: vi.fn().mockResolvedValue(penalty),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...penalty, ...data })),
    },
    penaltyEvent: { create: vi.fn().mockResolvedValue({ id: 'penalty-event-1' }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  const prisma = {
    penalty: { findMany: vi.fn().mockResolvedValue([penalty]) },
    $transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx),
  };
  const outbox = { enqueueEvent: vi.fn().mockResolvedValue(undefined) };
  return { penalty, tx, prisma, outbox, service: new PenaltyService(prisma as any, outbox as any) };
}

describe('Competition penalty management', () => {
  it('creates a Game-scoped penalty with explicit context, effect, issuer, reason, and audit', async () => {
    const { penalty, tx, outbox, service } = createPenaltyServiceFixture();
    const result = await service.createPenalty({
      scopeType: 'GAME',
      scopeId: gameId,
      playerId,
      type: 'SUSPENSION',
      reason: 'Operator-reviewed suspension',
      effectiveAt: '2027-01-04T12:00:00.000Z',
      expiresAt: '2027-01-05T12:00:00.000Z',
    }, {
      id: userId,
      role: 'OPERATOR',
      permissions: ['MANAGE_PENALTIES'],
      requestId: 'penalty-create',
    });

    expect(result.id).toBe(penalty.id);
    expect(tx.penalty.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        scope_type: 'GAME',
        scope_id: gameId,
        game_id: gameId,
        series_id: seriesId,
        plot_id: plotId,
        phase_id: phaseId,
        season_id: seasonId,
        player_id: playerId,
        issued_by_id: userId,
        type: 'SUSPENSION',
        effect_type: 'EXECUTION_BLOCK',
        effect_status: 'DECLARED_NOT_APPLIED',
        status: 'PROPOSED',
        reason: 'Operator-reviewed suspension',
        effective_at: new Date('2027-01-04T12:00:00.000Z'),
      }),
    }));
    expect(tx.penaltyEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'PENALTY_PROPOSED', to_status: 'PROPOSED', actor_id: userId }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entity_type: 'Penalty', action: 'PENALTY_PENALTY_PROPOSED', actor_id: userId }),
    }));
    expect(outbox.enqueueEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventName: 'penalty.proposed' }));
  });

  it('requires a positive point deduction amount and constrains forfeits to match/game/series scopes', async () => {
    const fixture = createPenaltyServiceFixture();
    await expect(fixture.service.createPenalty({
      scopeType: 'PLAYER', scopeId: playerId, type: 'POINT_DEDUCTION', reason: 'Points penalty',
    }, { id: userId })).rejects.toThrow('positive effect amount');
    await expect(fixture.service.createPenalty({
      scopeType: 'PHASE', scopeId: phaseId, type: 'FORFEIT', reason: 'Forfeit',
    }, { id: userId })).rejects.toThrow('Match, Series, or Game');
    expect(fixture.tx.penalty.create).not.toHaveBeenCalled();
  });

  it('supports user-scoped penalties and makes the competition effect explicit', async () => {
    expect(resolvePenaltyEffect('FORFEIT', 'GAME')).toBe('GAME_FORFEIT');
    expect(resolvePenaltyEffect('FORFEIT', 'SERIES')).toBe('SERIES_FORFEIT');
    expect(resolvePenaltyEffect('DISQUALIFICATION', 'SEASON')).toBe('COMPETITION_DISQUALIFICATION');

    const fixture = createPenaltyServiceFixture();
    fixture.tx.user = {
      findUnique: vi.fn().mockResolvedValue({ id: userId }),
    };

    await fixture.service.createPenalty({
      scopeType: 'USER',
      scopeId: userId,
      type: 'SUSPENSION',
      reason: 'User access lock',
    }, { id: userId, role: 'ADMIN', permissions: ['MANAGE_PENALTIES'], requestId: 'user-scope' });

    expect(fixture.tx.penalty.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        scope_type: 'USER',
        scope_id: userId,
        user_id: userId,
        effect_type: 'EXECUTION_BLOCK',
      }),
    }));
  });

  it('audits status transitions and keeps competition effects explicitly unapplied', async () => {
    const fixture = createPenaltyServiceFixture();
    const active = await fixture.service.updatePenaltyStatus(penaltyId, {
      status: 'UNDER_REVIEW',
      reason: 'Review initiated',
    }, { id: userId, role: 'COMMISSIONER', requestId: 'status-change' });

    expect(active.status).toBe('UNDER_REVIEW');
    expect(fixture.tx.penalty.update).toHaveBeenCalledWith({
      where: { id: penaltyId },
      data: { status: 'UNDER_REVIEW', effect_status: 'DECLARED_NOT_APPLIED' },
    });
    expect(fixture.tx.penaltyEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'STATUS_UNDER_REVIEW', from_status: 'PROPOSED', to_status: 'UNDER_REVIEW', reason: 'Review initiated' }),
    }));
    expect(fixture.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'PENALTY_STATUS_UNDER_REVIEW', request_id: 'status-change' }),
    }));
    expect(fixture.tx).not.toHaveProperty('game.update');
    expect(fixture.tx).not.toHaveProperty('series.update');
  });

  it('refuses activation before the effective time and refuses reasonless status changes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
    try {
      const fixture = createPenaltyServiceFixture();
      fixture.tx.penalty.findUnique.mockResolvedValue({ ...fixture.penalty, status: 'APPROVED', effective_at: new Date('2027-01-04T00:00:00.000Z') });
      await expect(fixture.service.updatePenaltyStatus(penaltyId, { status: 'ACTIVE', reason: 'Activate' }, { id: userId }))
        .rejects.toThrow('not effective yet');
      await expect(fixture.service.updatePenaltyStatus(penaltyId, { status: 'UNDER_REVIEW', reason: ' ' }, { id: userId }))
        .rejects.toThrow('reason is required');
      expect(fixture.tx.penalty.update).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('builds auditable competition effects for forfeit and disqualification penalties', () => {
    const gameForfeit = buildPenaltyEffectPlan({
      id: penaltyId,
      scope_type: 'GAME',
      scope_id: gameId,
      player_id: playerId,
      type: 'FORFEIT',
      effect_type: 'GAME_FORFEIT',
      effect_status: 'DECLARED_NOT_APPLIED',
      status: 'APPROVED',
      reason: 'Forfeit due to no-show',
      match_id: 'match-1',
      game_id: gameId,
      series_id: seriesId,
    }, {
      homePlayerId: playerId,
      awayPlayerId: 'a-other-player',
      winnerPlayerId: 'a-other-player',
    });

    expect(gameForfeit.effectType).toBe('GAME_FORFEIT');
    expect(gameForfeit.shouldApply).toBe(true);
    expect(gameForfeit.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'MATCH_RESULT' }),
    ]));
    expect(gameForfeit.audit).toEqual(expect.objectContaining({
      action: 'PENALTY_EFFECT_APPLIED',
      effectType: 'GAME_FORFEIT',
      reversalAllowed: true,
    }));

    const disqualification = buildPenaltyEffectPlan({
      id: 'penalty-disqualify',
      scope_type: 'PLAYER',
      scope_id: playerId,
      player_id: playerId,
      type: 'DISQUALIFICATION',
      effect_type: 'COMPETITION_DISQUALIFICATION',
      effect_status: 'DECLARED_NOT_APPLIED',
      status: 'APPROVED',
      reason: 'Disqualification',
    }, {
      playerId,
    });

    expect(disqualification.effectType).toBe('COMPETITION_DISQUALIFICATION');
    expect(disqualification.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'PLAYER_ELIGIBILITY' }),
    ]));
  });

  it('applies the penalty effect and records the action as auditable', async () => {
    const tx = {
      penalty: {
        findUnique: vi.fn().mockResolvedValue({
          id: penaltyId,
          status: 'APPROVED',
          effect_type: 'EXECUTION_BLOCK',
          effect_status: 'DECLARED_NOT_APPLIED',
          scope_type: 'PLAYER',
          scope_id: playerId,
          player_id: playerId,
          reason: 'Player suspended',
          issued_by_id: userId,
          effective_at: new Date('2027-01-04T00:00:00.000Z'),
        }),
        update: vi.fn().mockImplementation(async ({ data }) => ({ id: penaltyId, ...data })),
      },
      penaltyEvent: { create: vi.fn().mockResolvedValue({ id: 'effect-event' }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-effect' }) },
      playerProfile: { update: vi.fn().mockResolvedValue({ id: playerId, player_status: 'SUSPENDED' }) },
      divisionParticipant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      match: { update: vi.fn().mockResolvedValue({ id: 'match-1' }) },
      matchResult: { upsert: vi.fn().mockResolvedValue({ id: 'match-result' }) },
      series: { update: vi.fn().mockResolvedValue({ id: seriesId }) },
      game: { update: vi.fn().mockResolvedValue({ id: gameId }) },
      standingsRow: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx),
      penalty: { findUnique: vi.fn().mockResolvedValue({
        id: penaltyId,
        status: 'APPROVED',
        effect_type: 'EXECUTION_BLOCK',
        effect_status: 'DECLARED_NOT_APPLIED',
        scope_type: 'PLAYER',
        scope_id: playerId,
        player_id: playerId,
        reason: 'Player suspended',
        issued_by_id: userId,
        effective_at: new Date('2027-01-04T00:00:00.000Z'),
      }) },
    };
    const outbox = { enqueueEvent: vi.fn().mockResolvedValue(undefined) };

    const service = new PenaltyEffectsService(prisma as any, outbox as any);
    const result = await service.applyPenaltyEffect(penaltyId, { id: userId, role: 'COMMISSIONER', requestId: 'effect-apply' });

    expect(result.effectType).toBe('EXECUTION_BLOCK');
    expect(result.audit.action).toBe('PENALTY_EFFECT_APPLIED');
    expect(tx.playerProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: playerId },
      data: expect.objectContaining({ player_status: 'SUSPENDED' }),
    }));
    expect(tx.penaltyEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'PENALTY_EFFECT_APPLIED' }),
    }));
  });
});
