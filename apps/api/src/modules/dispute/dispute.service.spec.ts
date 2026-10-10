import { describe, expect, it, vi } from 'vitest';
import { DisputeService } from './dispute.service.js';

const disputeId = '10000000-0000-4000-8000-000000000001';
const gameId = '20000000-0000-4000-8000-000000000001';
const seriesId = '30000000-0000-4000-8000-000000000001';
const plotId = '40000000-0000-4000-8000-000000000001';
const phaseId = '50000000-0000-4000-8000-000000000001';
const seasonId = '60000000-0000-4000-8000-000000000001';
const playerId = '70000000-0000-4000-8000-000000000001';
const userId = '80000000-0000-4000-8000-000000000001';

function createDisputeServiceFixture() {
  const dispute = {
    id: disputeId,
    target_type: 'GAME',
    target_id: gameId,
    game_id: gameId,
    series_id: seriesId,
    plot_id: plotId,
    phase_id: phaseId,
    season_id: seasonId,
    user_id: userId,
    player_id: playerId,
    issue: 'Game score is incorrect',
    status: 'SUBMITTED',
    assigned_reviewer_id: null,
    decision: null,
    resolution_reason: null,
  };
  const tx = {
    game: { findUnique: vi.fn().mockResolvedValue({
      id: gameId,
      series: {
        id: seriesId,
        season_id: seasonId,
        phase_id: phaseId,
        plot_id: plotId,
        participant_player_ids: [playerId, '90000000-0000-4000-8000-000000000001'],
        games: [],
      },
    }) },
    series: { findUnique: vi.fn().mockResolvedValue({
      id: seriesId,
      season_id: seasonId,
      phase_id: phaseId,
      plot_id: plotId,
      participant_player_ids: [playerId, '90000000-0000-4000-8000-000000000001'],
      games: [],
    }) },
    playerProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: playerId }),
      findMany: vi.fn().mockResolvedValue([
        { id: playerId, user_id: userId },
        { id: '90000000-0000-4000-8000-000000000001', user_id: '90000000-0000-4000-8000-000000000002' },
      ]),
    },
    notificationPreference: { findMany: vi.fn().mockResolvedValue([]) },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: userId, deleted_at: null }) },
    dispute: {
      create: vi.fn().mockResolvedValue(dispute),
      findUnique: vi.fn().mockResolvedValue({ ...dispute, status: 'UNDER_REVIEW' }),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...dispute, ...data })),
    },
    disputeEvidence: { create: vi.fn().mockResolvedValue({ id: 'evidence-1', dispute_id: disputeId }) },
    disputeEvent: { create: vi.fn().mockResolvedValue({ id: 'event-1' }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  const prisma = { $transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx) };
  const outbox = { enqueueEvent: vi.fn().mockResolvedValue(undefined) };
  return { dispute, tx, outbox, service: new DisputeService(prisma as any, outbox as any) };
}

describe('Series and Game disputes', () => {
  it('creates a Game-targeted dispute with full hierarchy and evidence', async () => {
    const { tx, outbox, service } = createDisputeServiceFixture();
    const result = await service.createDispute({
      targetType: 'GAME',
      targetId: gameId,
      issue: 'Game score is incorrect',
      evidenceUrls: ['https://example.test/evidence/score.png'],
    }, { id: userId, role: 'PLAYER', roles: ['PLAYER'], permissions: [], requestId: 'request-dispute' });

    expect(result.id).toBe(disputeId);
    expect(tx.dispute.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        target_type: 'GAME',
        target_id: gameId,
        game_id: gameId,
        series_id: seriesId,
        plot_id: plotId,
        phase_id: phaseId,
        season_id: seasonId,
        player_id: playerId,
        user_id: userId,
        status: 'SUBMITTED',
      }),
    }));
    expect(tx.disputeEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'SUBMITTED', to_status: 'SUBMITTED' }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entity_type: 'Dispute', action: 'DISPUTE_SUBMITTED', request_id: 'request-dispute' }),
    }));
    expect(outbox.enqueueEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventName: 'dispute.submitted' }));
  });

  it('creates a Series-targeted dispute and rejects a nonparticipant submitter', async () => {
    const fixture = createDisputeServiceFixture();
    await fixture.service.createDispute({ targetType: 'SERIES', targetId: seriesId, issue: 'Series pairing issue' }, {
      id: userId,
      permissions: [],
    });
    expect(fixture.tx.dispute.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ target_type: 'SERIES', target_id: seriesId, series_id: seriesId, game_id: null }),
    }));

    const forbidden = createDisputeServiceFixture();
    forbidden.tx.playerProfile.findUnique.mockResolvedValue({ id: '90000000-0000-4000-8000-000000000099' });
    await expect(forbidden.service.createDispute({ targetType: 'GAME', targetId: gameId, issue: 'Not my Game' }, {
      id: userId,
      permissions: [],
    })).rejects.toThrow('Only a participant');
    expect(forbidden.tx.dispute.create).not.toHaveBeenCalled();
  });

  it('records reasoned reviewer decisions and never writes competition state', async () => {
    const { tx, service } = createDisputeServiceFixture();
    const result = await service.decideDispute(disputeId, 'RESOLVE', 'Verified against the match recording.', {
      id: userId,
      role: 'COMMISSIONER',
      permissions: ['MANAGE_DISPUTES'],
      requestId: 'decision-request',
    });

    expect(result).toMatchObject({ status: 'RESOLVED', decision: 'RESOLVE', resolution_reason: 'Verified against the match recording.' });
    expect(tx.dispute.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: disputeId },
      data: expect.objectContaining({ status: 'RESOLVED', decision: 'RESOLVE', resolved_at: expect.any(Date) }),
    }));
    expect(tx.disputeEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'DECISION_RESOLVE', from_status: 'UNDER_REVIEW', to_status: 'RESOLVED' }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'DISPUTE_DECISION_RESOLVE', entity_id: disputeId, reason: 'Verified against the match recording.' }),
    }));
    expect(tx).not.toHaveProperty('game.update');
    expect(tx).not.toHaveProperty('series.update');
  });

  it('requires reasons for decisions and refuses decisions outside review', async () => {
    const fixture = createDisputeServiceFixture();
    await expect(fixture.service.decideDispute(disputeId, 'REJECT', '   ', { permissions: ['MANAGE_DISPUTES'] }))
      .rejects.toThrow('reason is required');

    fixture.tx.dispute.findUnique.mockResolvedValueOnce({ ...fixture.dispute, status: 'SUBMITTED' });
    await expect(fixture.service.decideDispute(disputeId, 'REJECT', 'Insufficient evidence', { permissions: ['MANAGE_DISPUTES'] }))
      .rejects.toThrow('under review');
    expect(fixture.tx.dispute.update).not.toHaveBeenCalled();
  });

  it('supports assignment, investigation, evidence, decision, and closure with an audited event at each step', async () => {
    const { dispute, tx, service } = createDisputeServiceFixture();
    tx.dispute.findUnique
      .mockResolvedValueOnce({ ...dispute, status: 'SUBMITTED' })
      .mockResolvedValueOnce({ ...dispute, status: 'UNDER_REVIEW' })
      .mockResolvedValueOnce({ ...dispute, status: 'UNDER_REVIEW' })
      .mockResolvedValueOnce({ ...dispute, status: 'UNDER_REVIEW' })
      .mockResolvedValueOnce({ ...dispute, status: 'RESOLVED' });
    const manager = { id: userId, role: 'COMMISSIONER', permissions: ['MANAGE_DISPUTES'], requestId: 'workflow-request' };

    await service.assignReviewer(disputeId, '90000000-0000-4000-8000-000000000002', manager);
    await service.addInvestigationNote(disputeId, 'Compared both players reports.', manager);
    await service.addEvidence(disputeId, { resourceUrl: 'https://example.test/evidence/replay.mp4' }, manager);
    await service.decideDispute(disputeId, 'RESOLVE', 'Replay confirms the submitted score.', manager);
    await service.closeDispute(disputeId, 'Decision recorded and acknowledged.', manager);

    expect(tx.dispute.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: disputeId },
      data: expect.objectContaining({ status: 'UNDER_REVIEW', assigned_reviewer_id: '90000000-0000-4000-8000-000000000002' }),
    }));
    expect(tx.disputeEvidence.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dispute_id: disputeId, resource_url: 'https://example.test/evidence/replay.mp4' }),
    }));
    expect(tx.disputeEvent.create.mock.calls.map(([call]) => call.data.action)).toEqual([
      'REVIEWER_ASSIGNED',
      'INVESTIGATION_NOTE_ADDED',
      'EVIDENCE_ADDED',
      'DECISION_RESOLVE',
      'CLOSED',
    ]);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(7);
    expect(tx.auditLog.create.mock.calls.filter(([input]) =>
      input.data.action === 'COMPETITION_NOTIFICATION_DELIVERED')).toHaveLength(2);
  });
});
