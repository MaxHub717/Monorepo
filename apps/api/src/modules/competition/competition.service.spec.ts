import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_COMPETITION_RULES } from './competition.domain.js';
import { CompetitionService } from './competition.service.js';

const attendanceSeriesId = '10000000-0000-4000-8000-000000000001';
const attendancePlayerIds = [
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
];

function createAttendanceFixture(overrides: Record<string, unknown> = {}) {
  const series = {
    id: attendanceSeriesId,
    phase_id: '30000000-0000-4000-8000-000000000001',
    phase: { id: '30000000-0000-4000-8000-000000000001', phase_number: 1, name: 'Opening Phase', status: 'ACTIVE', schedule_locked: true },
    status: 'SCHEDULED',
    participant_player_ids: attendancePlayerIds,
    schedule_key: 'series-checkin-key',
    check_in_opens_at: new Date('2027-01-04T11:00:00.000Z'),
    check_in_closes_at: new Date('2027-01-04T11:30:00.000Z'),
    match_window_start: new Date('2027-01-04T12:00:00.000Z'),
    match_window_end: new Date('2027-01-04T13:00:00.000Z'),
    match_window_timezone: 'UTC',
    results_deadline_at: new Date('2027-01-04T13:30:00.000Z'),
    season: { competition_timezone: 'UTC', ruleset: null },
    games: [{ game_number: 1, home_player_id: attendancePlayerIds[0], away_player_id: attendancePlayerIds[1] }],
    check_ins: [],
    ...overrides,
  };
  const createdCheckIn = {
    id: '40000000-0000-4000-8000-000000000001',
    series_id: attendanceSeriesId,
    player_id: attendancePlayerIds[0],
    checked_in_at: new Date('2027-01-04T11:15:00.000Z'),
    checked_in_by_id: '50000000-0000-4000-8000-000000000001',
    is_exception: false,
    exception_reason: null,
  };
  const tx = {
    series: {
      findUnique: vi.fn().mockResolvedValue(series),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    playerProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: attendancePlayerIds[0], gamer_tag: 'Player One' }),
    },
    seriesCheckIn: {
      findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(createdCheckIn),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-check-in' }) },
  };
  const prisma = {
    $transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx),
    seriesCheckIn: { findUnique: vi.fn() },
  };
  return { series, createdCheckIn, tx, prisma, service: new CompetitionService(prisma as any, {} as any) };
}

function createExecutionFixture(input: {
  status?: string;
  games?: Array<Record<string, unknown>>;
  checkIns?: Array<{ player_id: string }>;
  overrides?: Record<string, unknown>;
} = {}) {
  const games = (input.games ?? [1, 2, 3].map((game_number) => ({
    id: `60000000-0000-4000-8000-00000000000${game_number}`,
    series_id: attendanceSeriesId,
    game_number,
    status: 'PENDING',
    home_player_id: attendancePlayerIds[0],
    away_player_id: attendancePlayerIds[1],
    home_score: 0,
    away_score: 0,
    result: null,
    winner_player_id: null,
    started_at: null,
    completed_at: null,
    result_recorded_at: null,
    result_recorded_by_id: null,
    result_reason: null,
    result_version: 0,
    result_verifications: [],
  }))).map((game) => {
    const resultVersion = Number(game.result_version ?? (game.status === 'COMPLETED' ? 1 : 0));
    const resultVerifications = game.result_verifications ?? (game.status === 'COMPLETED' && game.result !== null
      ? [{ id: `verification-${game.game_number}`, result_version: resultVersion, status: 'APPROVED', reason: null }]
      : []);
    return { ...game, result_version: resultVersion, result_verifications: resultVerifications };
  });
  const series = {
    id: attendanceSeriesId,
    status: input.status ?? 'IN_PROGRESS',
    participant_player_ids: attendancePlayerIds,
    schedule_key: 'execution-schedule-key',
    phase_id: '30000000-0000-4000-8000-000000000001',
    phase: { id: '30000000-0000-4000-8000-000000000001', phase_number: 1, name: 'Opening Phase', status: 'ACTIVE', schedule_locked: true },
    season: { id: 'season-execution', name: 'Execution Season', competition_timezone: 'UTC', ruleset: null },
    plot: { id: 'plot-execution', name: 'Plot 1' },
    check_in_opens_at: new Date('2027-01-04T11:00:00.000Z'),
    check_in_closes_at: new Date('2027-01-04T11:30:00.000Z'),
    match_window_start: new Date('2027-01-04T12:00:00.000Z'),
    match_window_end: new Date('2027-01-04T13:00:00.000Z'),
    match_window_timezone: 'UTC',
    results_deadline_at: new Date('2027-01-04T13:30:00.000Z'),
    series_number: 1,
    winner_player_id: null,
    elimination_outcome: null,
    check_ins: input.checkIns ?? attendancePlayerIds.map((player_id) => ({ player_id })),
    games,
    ...input.overrides,
  };
  const tx = {
    series: {
      findUnique: vi.fn().mockResolvedValue(series),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue(series),
    },
    game: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => games.find((game) => game.id === where.id)),
    },
    gameResultAudit: { create: vi.fn().mockResolvedValue({ id: 'game-result-audit' }) },
    gameResultVerification: {
      create: vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => ({
        id: 'game-result-verification',
        status: data.status,
      })),
    },
    seriesResolutionAudit: { create: vi.fn().mockResolvedValue({ id: 'series-resolution-audit' }) },
    playerProfile: {
      findMany: vi.fn().mockResolvedValue(attendancePlayerIds.map((id) => ({ id, user_id: `user-${id}` }))),
    },
    notificationPreference: { findMany: vi.fn().mockResolvedValue([]) },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'execution-audit' }) },
  };
  const prisma = {
    series: { findUnique: vi.fn().mockResolvedValue(series) },
    playerProfile: { findMany: vi.fn().mockResolvedValue(attendancePlayerIds.map((id, index) => ({ id, gamer_tag: `Player ${index + 1}` }))) },
    $transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx),
  };
  return { series, games, tx, prisma, service: new CompetitionService(prisma as any, {} as any) };
}

describe('Competition ruleset administration', () => {
  it('creates a draft, previews generated player rules, and publishes an immutable version with an audit hash', async () => {
    const draft = {
      id: 'ruleset-1',
      name: 'Standard Competition',
      version: '1.0.0',
      description: null,
      status: 'DRAFT',
      rules: DEFAULT_COMPETITION_RULES,
      rules_hash: null,
      published_at: null,
      published_by_id: null,
      supersedes_ruleset_id: null,
    };
    const published = {
      ...draft,
      status: 'PUBLISHED',
      rules_hash: 'a'.repeat(64),
      published_at: new Date('2026-10-09T12:00:00.000Z'),
      published_by_id: 'admin-1',
    };
    const tx = {
      competitionRuleset: {
        create: vi.fn().mockResolvedValue(draft),
        findUnique: vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(draft),
        update: vi.fn().mockResolvedValue(published),
        findMany: vi.fn(),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const prisma = {
      competitionRuleset: { findUnique: vi.fn().mockResolvedValue(draft) },
      $transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx),
    };
    const service = new CompetitionService(prisma as any, {} as any);

    await service.createRuleset({ name: draft.name, version: draft.version, rules: DEFAULT_COMPETITION_RULES }, { id: 'admin-1', role: 'HQ_ADMIN' });
    expect(tx.competitionRuleset.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DRAFT', rules: DEFAULT_COMPETITION_RULES }),
    }));

    const preview = await service.previewRuleset(draft.id);
    expect(preview.playerFacing.version).toBe('1.0.0');
    expect(preview.playerFacing.text).toContain('draw eliminates both participants');

    const result = await service.publishRuleset(draft.id, { id: 'admin-1', role: 'HQ_ADMIN' });
    expect(result.rules_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(tx.competitionRuleset.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: draft.id },
      data: expect.objectContaining({ status: 'PUBLISHED', published_by_id: 'admin-1' }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RULESET_PUBLISHED', entity_id: draft.id }),
    }));
  });

  it('refuses draft edits to published rulesets and renders a Season’s attached historical version', async () => {
    const publishedRuleset = {
      id: 'ruleset-old',
      name: 'Standard Competition',
      version: '1.0.0',
      description: null,
      status: 'PUBLISHED',
      rules: DEFAULT_COMPETITION_RULES,
      rules_hash: 'b'.repeat(64),
      published_at: new Date('2026-01-01T00:00:00.000Z'),
      published_by_id: 'admin-1',
      supersedes_ruleset_id: null,
    };
    const tx = {
      competitionRuleset: {
        findUnique: vi.fn().mockResolvedValue(publishedRuleset),
        update: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      $transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx),
      season: { findUnique: vi.fn().mockResolvedValue({
        id: 'season-1',
        ruleset_id: publishedRuleset.id,
        ruleset_name: 'Standard Competition',
        ruleset_version: '1.0.0',
        ruleset: publishedRuleset,
      }) },
    };
    const service = new CompetitionService(prisma as any, {} as any);

    await expect(service.updateDraftRuleset(publishedRuleset.id, { rules: DEFAULT_COMPETITION_RULES }, {}))
      .rejects.toThrow('Published rulesets are immutable');
    expect(tx.competitionRuleset.update).not.toHaveBeenCalled();

    const playerRules = await service.getSeasonRules('season-1');
    expect(playerRules.rulesetVersion).toBe('1.0.0');
    expect(playerRules.rulesHash).toBe('b'.repeat(64));
    expect(playerRules.playerFacing.text).toContain('version 1.0.0');
  });
});

describe('Competition Series check-in and attendance', () => {
  it('returns named participant attendance and server time in the operator workspace', async () => {
    const series = {
      id: attendanceSeriesId,
      series_number: 1,
      status: 'SCHEDULED',
      participant_player_ids: attendancePlayerIds,
      schedule_key: 'series-checkin-key',
      check_in_opens_at: new Date('2027-01-04T11:00:00.000Z'),
      check_in_closes_at: new Date('2027-01-04T11:30:00.000Z'),
      match_window_start: new Date('2027-01-04T12:00:00.000Z'),
      match_window_end: new Date('2027-01-04T13:00:00.000Z'),
      match_window_timezone: 'UTC',
      results_deadline_at: new Date('2027-01-04T13:30:00.000Z'),
      winner_player_id: null,
      elimination_outcome: null,
      check_ins: [{
        player_id: attendancePlayerIds[0],
        checked_in_at: new Date('2027-01-04T11:15:00.000Z'),
        is_exception: true,
        exception_reason: 'Verified arrival with operator',
      }],
      games: [1, 2, 3].map((game_number) => ({
        id: `game-${game_number}`,
        game_number,
        status: 'PENDING',
        result: null,
        winner_player_id: null,
        home_player_id: attendancePlayerIds[0],
        away_player_id: attendancePlayerIds[1],
      })),
    };
    const season = {
      id: 'season-attendance',
      name: 'Attendance Season',
      league: { name: 'NGL' },
      status: 'ACTIVE',
      start_date: null,
      end_date: null,
      competition_timezone: 'UTC',
      ruleset: null,
      phases: [{
        id: 'phase-attendance',
        phase_number: 1,
        phase_type: 'QUALIFYING',
        name: 'Qualifying',
        status: 'ACTIVE',
        start_at: null,
        end_at: null,
        schedule_locked: true,
        participating_player_ids: attendancePlayerIds,
        plots: [{ id: 'plot-attendance', name: 'Plot 1', player_ids: attendancePlayerIds, series: [series] }],
      }],
    };
    const prisma = {
      season: { findUnique: vi.fn().mockResolvedValue(season) },
      playerProfile: { findMany: vi.fn().mockResolvedValue([
        { id: attendancePlayerIds[0], gamer_tag: 'Player One' },
        { id: attendancePlayerIds[1], gamer_tag: 'Player Two' },
      ]) },
    };
    const service = new CompetitionService(prisma as any, {} as any);

    const workspace = await service.getWorkspace(season.id);
    const attendance = workspace.phases[0].plots[0].series[0].checkIn;
    expect(Date.parse(workspace.serverTime)).not.toBeNaN();
    expect(attendance.participants).toMatchObject([
      { playerId: attendancePlayerIds[0], gamerTag: 'Player One', status: 'CHECKED_IN', isException: true, exceptionReason: 'Verified arrival with operator' },
      { playerId: attendancePlayerIds[1], gamerTag: 'Player Two', status: 'NOT_CHECKED_IN' },
    ]);
    expect(attendance.checkedInCount).toBe(1);
    expect(workspace.phases[0].plots[0].series[0].execution.canStart).toBe(false);
    expect(workspace.phases[0].progression).toMatchObject({
      phaseFinalized: false,
      participantCount: 2,
      playedSeriesCount: 0,
      pendingSeriesCount: 1,
      survivors: [],
      advancementEligiblePlayerIds: [],
    });
  });

  it('persists a participant check-in once and audits the operator action', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-04T11:15:00.000Z'));
    try {
      const { service, tx } = createAttendanceFixture();
      const result = await service.recordSeriesCheckIn(
        attendanceSeriesId,
        attendancePlayerIds[0],
        {},
        { id: '50000000-0000-4000-8000-000000000001', role: 'HQ_ADMIN', requestId: 'request-check-in' },
      );

      expect(result.alreadyCheckedIn).toBe(false);
      expect(tx.seriesCheckIn.createMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          series_id: attendanceSeriesId,
          player_id: attendancePlayerIds[0],
          checked_in_at: new Date('2027-01-04T11:15:00.000Z'),
          is_exception: false,
          exception_reason: null,
        }),
        skipDuplicates: true,
      }));
      expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: 'SERIES_PARTICIPANT_CHECKED_IN',
          entity_id: attendanceSeriesId,
          actor_id: '50000000-0000-4000-8000-000000000001',
          request_id: 'request-check-in',
        }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects forged participant identity and early or late check-in', async () => {
    const forged = createAttendanceFixture();
    await expect(forged.service.recordSeriesCheckIn(
      attendanceSeriesId,
      '20000000-0000-4000-8000-000000000099',
      {},
      { id: '50000000-0000-4000-8000-000000000001' },
    )).rejects.toThrow('not a participant');
    expect(forged.tx.playerProfile.findUnique).not.toHaveBeenCalled();

    for (const serverTime of ['2027-01-04T10:59:59.999Z', '2027-01-04T11:30:00.000Z']) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(serverTime));
      try {
        const { service, tx } = createAttendanceFixture();
        await expect(service.recordSeriesCheckIn(
          attendanceSeriesId,
          attendancePlayerIds[0],
          {},
          { id: '50000000-0000-4000-8000-000000000001' },
        )).rejects.toThrow(serverTime.includes('10:59') ? 'not open yet' : 'closed');
        expect(tx.seriesCheckIn.createMany).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    }
  });

  it('makes duplicate check-in idempotent and requires a reason for exception handling', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-04T11:15:00.000Z'));
    try {
      const existing = { id: 'check-in-existing', player_id: attendancePlayerIds[0] };
      const duplicate = createAttendanceFixture();
      duplicate.tx.seriesCheckIn.findUnique.mockReset();
      duplicate.tx.seriesCheckIn.findUnique.mockResolvedValue(existing);
      const repeated = await duplicate.service.recordSeriesCheckIn(
        attendanceSeriesId,
        attendancePlayerIds[0],
        {},
        { id: '50000000-0000-4000-8000-000000000001' },
      );
      expect(repeated).toMatchObject({ id: 'check-in-existing', alreadyCheckedIn: true });
      expect(duplicate.tx.seriesCheckIn.createMany).not.toHaveBeenCalled();
      expect(duplicate.tx.auditLog.create).not.toHaveBeenCalled();

      const concurrentDuplicate = createAttendanceFixture();
      concurrentDuplicate.tx.seriesCheckIn.findUnique.mockReset();
      concurrentDuplicate.tx.seriesCheckIn.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing);
      concurrentDuplicate.tx.seriesCheckIn.createMany.mockResolvedValue({ count: 0 });
      const concurrentResult = await concurrentDuplicate.service.recordSeriesCheckIn(
        attendanceSeriesId,
        attendancePlayerIds[0],
        {},
        { id: '50000000-0000-4000-8000-000000000001' },
      );
      expect(concurrentResult).toMatchObject({ id: 'check-in-existing', alreadyCheckedIn: true });
      expect(concurrentDuplicate.tx.auditLog.create).not.toHaveBeenCalled();

      const missingReason = createAttendanceFixture();
      await expect(missingReason.service.recordSeriesCheckIn(
        attendanceSeriesId,
        attendancePlayerIds[0],
        { isException: true },
        { id: '50000000-0000-4000-8000-000000000001' },
      )).rejects.toThrow('exception reason is required');
      expect(missingReason.tx.seriesCheckIn.createMany).not.toHaveBeenCalled();

      const unauthorized = createAttendanceFixture();
      await expect(unauthorized.service.recordSeriesCheckIn(
        attendanceSeriesId,
        attendancePlayerIds[0],
        { isException: true, reason: 'Late arrival' },
        { id: '50000000-0000-4000-8000-000000000001', role: 'OPERATOR' },
      )).rejects.toThrow('MANAGE_COMPETITION_EXCEPTIONS');
      expect(unauthorized.tx.seriesCheckIn.createMany).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('audits out-of-window exceptions and starts only with both participants present', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-04T10:45:00.000Z'));
    try {
      const exception = createAttendanceFixture();
      await exception.service.recordSeriesCheckIn(
        attendanceSeriesId,
        attendancePlayerIds[0],
        { isException: true, reason: 'Verified arrival with operator' },
        {
          id: '50000000-0000-4000-8000-000000000001',
          role: 'HQ_ADMIN',
          requestId: 'check-in-exception',
          permissions: ['MANAGE_COMPETITION_EXCEPTIONS'],
        },
      );
      expect(exception.tx.seriesCheckIn.createMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ is_exception: true, exception_reason: 'Verified arrival with operator' }),
        skipDuplicates: true,
      }));
      expect(exception.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: 'SERIES_CHECK_IN_EXCEPTION_RECORDED',
          actor_id: '50000000-0000-4000-8000-000000000001',
          reason: 'Verified arrival with operator',
          request_id: 'check-in-exception',
          correlation_id: 'check-in-exception',
          before_state: { isCheckedIn: false, seriesStatus: 'SCHEDULED' },
          after_state: expect.objectContaining({ isException: true, evidenceUrl: null }),
        }),
      }));
    } finally {
      vi.useRealTimers();
    }

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-04T12:15:00.000Z'));
    try {
      const blocked = createAttendanceFixture({ check_ins: [{ player_id: attendancePlayerIds[0] }] });
      await expect(blocked.service.startSeries(attendanceSeriesId, { id: '50000000-0000-4000-8000-000000000001' }))
        .rejects.toThrow('Both participants must check in');
      expect(blocked.tx.series.updateMany).not.toHaveBeenCalled();

      const ready = createAttendanceFixture({
        check_ins: attendancePlayerIds.map((player_id) => ({ player_id })),
      });
      const started = await ready.service.startSeries(attendanceSeriesId, {
        id: '50000000-0000-4000-8000-000000000001',
        role: 'HQ_ADMIN',
      });
      expect(started.status).toBe('IN_PROGRESS');
      expect(ready.tx.series.updateMany).toHaveBeenCalledWith({
        where: { id: attendanceSeriesId, status: 'SCHEDULED' },
        data: { status: 'IN_PROGRESS' },
      });
      expect(ready.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ action: 'SERIES_STARTED', entity_id: attendanceSeriesId }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Competition Series execution workspace', () => {
  it('shows the hierarchy, current score, Game states, and server-derived remaining time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-04T12:15:00.000Z'));
    try {
      const games = [1, 2, 3].map((game_number) => ({
        id: `60000000-0000-4000-8000-00000000000${game_number}`,
        series_id: attendanceSeriesId,
        game_number,
        status: game_number === 1 ? 'IN_PROGRESS' : 'PENDING',
        home_player_id: attendancePlayerIds[0],
        away_player_id: attendancePlayerIds[1],
        home_score: game_number === 1 ? 2 : 0,
        away_score: game_number === 1 ? 1 : 0,
        result: null,
        winner_player_id: null,
        started_at: game_number === 1 ? new Date('2027-01-04T12:05:00.000Z') : null,
        completed_at: null,
        result_recorded_at: null,
        result_recorded_by_id: null,
        result_reason: null,
        result_version: 0,
      }));
      const { service } = createExecutionFixture({ games });
      const workspace = await service.getSeriesExecutionWorkspace(attendanceSeriesId);

      expect(workspace).toMatchObject({
        phase: { number: 1, name: 'Opening Phase' },
        plot: { name: 'Plot 1' },
        participants: [
          { id: attendancePlayerIds[0], gamerTag: 'Player 1', checkedIn: true },
          { id: attendancePlayerIds[1], gamerTag: 'Player 2', checkedIn: true },
        ],
        currentScore: { gameNumber: 1, home: 2, away: 1 },
        games: [
          { number: 1, status: 'IN_PROGRESS', homeScore: 2, awayScore: 1, canUpdateScore: true },
          { number: 2, status: 'PENDING', canStart: false },
          { number: 3, status: 'PENDING', canStart: false },
        ],
      });
      expect(workspace.matchWindow.remainingMs).toBe(45 * 60 * 1000);
      expect(Date.parse(workspace.serverTime)).toBe(Date.parse('2027-01-04T12:15:00.000Z'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts Games only in order during the active Match Window and audits the transition', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-04T12:15:00.000Z'));
    try {
      const fixture = createExecutionFixture();
      await fixture.service.startGame(attendanceSeriesId, fixture.games[0].id as string, {
        id: '50000000-0000-4000-8000-000000000001',
        role: 'HQ_ADMIN',
      });
      expect(fixture.tx.game.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: fixture.games[0].id, series_id: attendanceSeriesId, status: 'PENDING' },
        data: expect.objectContaining({ status: 'IN_PROGRESS', started_at: new Date('2027-01-04T12:15:00.000Z') }),
      }));
      expect(fixture.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ action: 'GAME_STARTED', entity_id: fixture.games[0].id }),
      }));

      const outOfWindow = createExecutionFixture();
      vi.setSystemTime(new Date('2027-01-04T11:59:59.999Z'));
      await expect(outOfWindow.service.startGame(attendanceSeriesId, outOfWindow.games[0].id as string, {}))
        .rejects.toThrow('active Series Match Window');
      expect(outOfWindow.tx.game.updateMany).not.toHaveBeenCalled();

      const outOfOrder = createExecutionFixture();
      await expect(outOfOrder.service.startGame(attendanceSeriesId, outOfOrder.games[1].id as string, {}))
        .rejects.toThrow('played in order');
      expect(outOfOrder.tx.game.updateMany).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('records Game results with score validation and an immutable result audit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-04T12:15:00.000Z'));
    try {
      const activeGame = {
        ...createExecutionFixture().games[0],
        status: 'IN_PROGRESS',
        result_version: 2,
      };
      const fixture = createExecutionFixture({ games: [activeGame, ...createExecutionFixture().games.slice(1)] });
      await expect(fixture.service.completeGame(attendanceSeriesId, activeGame.id as string, {
        result: 'HOME_WIN', homeScore: 1, awayScore: 2,
      }, {})).rejects.toThrow('score must agree');
      expect(fixture.tx.game.updateMany).not.toHaveBeenCalled();

      await fixture.service.completeGame(attendanceSeriesId, activeGame.id as string, {
        result: 'HOME_WIN', homeScore: 2, awayScore: 1, reason: 'Operator verified score',
      }, { id: '50000000-0000-4000-8000-000000000001', role: 'HQ_ADMIN', requestId: 'result-request' });
      expect(fixture.tx.game.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: activeGame.id, status: 'IN_PROGRESS', result_version: 2 }),
        data: expect.objectContaining({ status: 'COMPLETED', result: 'HOME_WIN', winner_player_id: attendancePlayerIds[0], home_score: 2, away_score: 1, result_version: 3 }),
      }));
      expect(fixture.tx.gameResultAudit.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          game_id: activeGame.id,
          result_version: 3,
          result: 'HOME_WIN',
          reason: 'Operator verified score',
          request_id: 'result-request',
        }),
      }));
      expect(fixture.tx.series.update).toHaveBeenCalledWith({
        where: { id: attendanceSeriesId },
        data: expect.objectContaining({
          completed_game_count: 1,
          home_win_count: 1,
          away_win_count: 0,
          draw_count: 0,
          resolution_state: 'IN_PROGRESS',
        }),
      });

      const duplicate = createExecutionFixture({ games: [{ ...activeGame, status: 'COMPLETED', result: 'HOME_WIN', result_version: 1 }] });
      await expect(duplicate.service.completeGame(attendanceSeriesId, activeGame.id as string, {
        result: 'HOME_WIN', homeScore: 2, awayScore: 1,
      }, {})).rejects.toThrow('Only the active Game');
      expect(duplicate.tx.game.updateMany).not.toHaveBeenCalled();

      const late = createExecutionFixture({ games: [activeGame, ...createExecutionFixture().games.slice(1)] });
      vi.setSystemTime(new Date('2027-01-04T13:30:00.000Z'));
      await expect(late.service.completeGame(attendanceSeriesId, activeGame.id as string, {
        result: 'HOME_WIN', homeScore: 2, awayScore: 1,
      }, {})).rejects.toThrow('result submission window is closed');
      expect(late.tx.game.updateMany).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('versions and audits live score edits to reject stale concurrent writes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-04T12:15:00.000Z'));
    try {
      const game = { ...createExecutionFixture().games[0], status: 'IN_PROGRESS' };
      const fixture = createExecutionFixture({ games: [game, ...createExecutionFixture().games.slice(1)] });
      await fixture.service.updateGameScore(attendanceSeriesId, game.id as string, { homeScore: 2, awayScore: 1 }, {
        id: '50000000-0000-4000-8000-000000000001',
        role: 'HQ_ADMIN',
        requestId: 'score-request',
      });

      expect(fixture.tx.game.updateMany).toHaveBeenCalledWith({
        where: { id: game.id, series_id: attendanceSeriesId, status: 'IN_PROGRESS', result_version: 0 },
        data: { home_score: 2, away_score: 1, result_version: 1 },
      });
      expect(fixture.tx.gameResultAudit.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ game_id: game.id, result_version: 1, action: 'GAME_SCORE_UPDATED', request_id: 'score-request' }),
      }));
      expect(fixture.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ action: 'GAME_SCORE_UPDATED', entity_id: game.id }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists a draw aggregate without resolving Series advancement early', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-04T12:15:00.000Z'));
    try {
      const game = { ...createExecutionFixture().games[0], status: 'IN_PROGRESS' };
      const fixture = createExecutionFixture({ games: [game, ...createExecutionFixture().games.slice(1)] });
      await fixture.service.completeGame(attendanceSeriesId, game.id as string, {
        result: 'DRAW', homeScore: 1, awayScore: 1,
      }, { id: '50000000-0000-4000-8000-000000000001' });

      expect(fixture.tx.series.update).toHaveBeenCalledWith({
        where: { id: attendanceSeriesId },
        data: expect.objectContaining({ completed_game_count: 1, draw_count: 1, resolution_state: 'DRAW' }),
      });
      expect(fixture.tx.series.update).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'ELIMINATED', elimination_outcome: 'BOTH_ELIMINATED' }),
      }));
      expect(fixture.tx.series.updateMany).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks Series completion until all three Games resolve, then finalizes advancement', async () => {
    const incomplete = createExecutionFixture();
    await expect(incomplete.service.completeSeries(attendanceSeriesId, {}))
      .rejects.toThrow('all three Games have resolved');
    expect(incomplete.tx.series.updateMany).not.toHaveBeenCalled();

    const completedGames = [
      ['HOME_WIN', attendancePlayerIds[0]],
      ['AWAY_WIN', attendancePlayerIds[1]],
      ['HOME_WIN', attendancePlayerIds[0]],
    ].map(([result, winner_player_id], index) => ({
      ...createExecutionFixture().games[index],
      status: 'COMPLETED',
      result,
      winner_player_id,
    }));
    const fixture = createExecutionFixture({ games: completedGames });
    const resolution = await fixture.service.completeSeries(attendanceSeriesId, {
      id: '50000000-0000-4000-8000-000000000001',
      role: 'HQ_ADMIN',
      requestId: 'series-completion',
    });

    expect(resolution).toMatchObject({ status: 'COMPLETED', winnerPlayerId: attendancePlayerIds[0], alreadyCompleted: false });
    expect(fixture.tx.series.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: attendanceSeriesId, status: 'IN_PROGRESS' },
      data: expect.objectContaining({ status: 'COMPLETED', completed_game_count: 3, winner_player_id: attendancePlayerIds[0] }),
    }));
    expect(fixture.tx.seriesResolutionAudit.create).toHaveBeenCalledTimes(1);
    expect(fixture.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'SERIES_ADVANCEMENT_FINALIZED', entity_id: attendanceSeriesId }),
    }));
  });

  it('requires explicit approval of every current result version before Series resolution', async () => {
    const games = [1, 2, 3].map((game_number) => ({
      ...createExecutionFixture().games[game_number - 1],
      status: 'COMPLETED',
      result: game_number < 3 ? 'HOME_WIN' : 'AWAY_WIN',
      winner_player_id: game_number < 3 ? attendancePlayerIds[0] : attendancePlayerIds[1],
      result_version: 1,
      result_verifications: [{ id: `verification-${game_number}`, result_version: 1, status: game_number === 2 ? 'PENDING' : 'APPROVED', reason: null }],
    }));
    const fixture = createExecutionFixture({ games });
    await expect(fixture.service.completeSeries(attendanceSeriesId, {}))
      .rejects.toThrow('Every current Game result must be approved or overridden');
    expect(fixture.tx.series.updateMany).not.toHaveBeenCalled();

    const pendingGame = games[1];
    const pendingFixture = createExecutionFixture({ games });
    const approval = await pendingFixture.service.verifyGameResult(attendanceSeriesId, pendingGame.id as string, {
      status: 'APPROVED',
    }, { id: '50000000-0000-4000-8000-000000000001', role: 'COMMISSIONER', requestId: 'approval-request' });
    expect(approval).toMatchObject({ status: 'APPROVED', alreadyVerified: false });
    expect(pendingFixture.tx.gameResultVerification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ game_id: pendingGame.id, result_version: 1, status: 'APPROVED' }),
    }));
    expect(pendingFixture.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'GAME_RESULT_APPROVED', request_id: 'approval-request' }),
    }));

    const ready = createExecutionFixture({
      games: games.map((game) => ({ ...game, result_verifications: [{ ...game.result_verifications[0], status: 'APPROVED' }] })),
    });
    await expect(ready.service.completeSeries(attendanceSeriesId, {})).resolves.toMatchObject({
      status: 'COMPLETED',
      winnerPlayerId: attendancePlayerIds[0],
    });
  });

  it('reports a complete aggregate as awaiting verification until all result versions are approved', async () => {
    const games = [1, 2, 3].map((game_number) => ({
      ...createExecutionFixture().games[game_number - 1],
      status: 'COMPLETED',
      result: game_number < 3 ? 'HOME_WIN' : 'AWAY_WIN',
      winner_player_id: game_number < 3 ? attendancePlayerIds[0] : attendancePlayerIds[1],
      result_version: 1,
      result_verifications: [{ id: `pending-${game_number}`, result_version: 1, status: 'PENDING', reason: null }],
    }));
    const { service } = createExecutionFixture({ games });
    const workspace = await service.getSeriesExecutionWorkspace(attendanceSeriesId);

    expect(workspace.series.resultState).toBe('AWAITING_VERIFICATION');
    expect(workspace.series.canComplete).toBe(false);
    expect(workspace.games.every((game) => game.canVerifyResult && game.verificationStatus === 'PENDING')).toBe(true);
  });

  it('exposes result override only when the caller has the explicit override permission', async () => {
    const completedGame = {
      ...createExecutionFixture().games[0],
      status: 'COMPLETED',
      result: 'HOME_WIN',
      winner_player_id: attendancePlayerIds[0],
    };
    const { service } = createExecutionFixture({
      games: [completedGame, ...createExecutionFixture().games.slice(1)],
    });

    const ordinaryWorkspace = await service.getSeriesExecutionWorkspace(attendanceSeriesId);
    const authorizedWorkspace = await service.getSeriesExecutionWorkspace(attendanceSeriesId, true);

    expect(ordinaryWorkspace.games[0].canOverrideResult).toBe(false);
    expect(authorizedWorkspace.games[0].canOverrideResult).toBe(true);
  });

  it('rejects or requests correction with a reason and reopens the submitted Game', async () => {
    const pendingGame = {
      ...createExecutionFixture().games[0],
      status: 'COMPLETED',
      result: 'HOME_WIN',
      winner_player_id: attendancePlayerIds[0],
      result_version: 1,
      result_verifications: [{ id: 'verification-pending', result_version: 1, status: 'PENDING', reason: null }],
    };
    const fixture = createExecutionFixture({ games: [pendingGame, ...createExecutionFixture().games.slice(1)] });
    await expect(fixture.service.verifyGameResult(attendanceSeriesId, pendingGame.id as string, {
      status: 'REJECTED',
    }, {})).rejects.toThrow('reason is required');
    expect(fixture.tx.game.updateMany).not.toHaveBeenCalled();

    const result = await fixture.service.verifyGameResult(attendanceSeriesId, pendingGame.id as string, {
      status: 'CORRECTION_REQUESTED',
      reason: 'Score differs from the submitted result.',
    }, { id: '50000000-0000-4000-8000-000000000001', role: 'COMMISSIONER', requestId: 'correction-request' });
    expect(result).toMatchObject({ status: 'CORRECTION_REQUESTED', alreadyVerified: false });
    expect(fixture.tx.game.updateMany).toHaveBeenCalledWith({
      where: { id: pendingGame.id, series_id: attendanceSeriesId, status: 'COMPLETED', result_version: 1 },
      data: expect.objectContaining({ status: 'IN_PROGRESS', result: null, winner_player_id: null }),
    });
    expect(fixture.tx.gameResultVerification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CORRECTION_REQUESTED', reason: 'Score differs from the submitted result.' }),
    }));
    expect(fixture.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'GAME_RESULT_CORRECTION_REQUESTED', request_id: 'correction-request' }),
    }));
  });

  it('overrides a result only with a reason and preserves both versions in audit history', async () => {
    const approvedGame = {
      ...createExecutionFixture().games[0],
      status: 'COMPLETED',
      result: 'HOME_WIN',
      winner_player_id: attendancePlayerIds[0],
      home_score: 2,
      away_score: 1,
      result_version: 1,
      result_reason: null,
      result_verifications: [{ id: 'verification-approved', result_version: 1, status: 'APPROVED', reason: null }],
    };
    const fixture = createExecutionFixture({ games: [approvedGame, ...createExecutionFixture().games.slice(1)] });
    await expect(fixture.service.overrideGameResult(attendanceSeriesId, approvedGame.id as string, {
      result: 'AWAY_WIN', homeScore: 1, awayScore: 2,
    }, {})).rejects.toThrow('reason is required');
    expect(fixture.tx.game.updateMany).not.toHaveBeenCalled();

    const overridden = await fixture.service.overrideGameResult(attendanceSeriesId, approvedGame.id as string, {
      result: 'AWAY_WIN',
      homeScore: 1,
      awayScore: 2,
      reason: 'Official replay confirmed the away win.',
      evidenceUrl: 'https://example.test/evidence/replay.mp4',
      reference: 'case-override-12',
    }, { id: '50000000-0000-4000-8000-000000000001', role: 'HQ_ADMIN', requestId: 'override-request' });
    expect(overridden).toMatchObject({ resultVersion: 2, result: 'AWAY_WIN', winnerPlayerId: attendancePlayerIds[1], verificationStatus: 'OVERRIDDEN' });
    expect(fixture.tx.gameResultAudit.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        result_version: 2,
        action: 'RESULT_OVERRIDDEN',
        reason: 'Official replay confirmed the away win.',
        before_state: expect.objectContaining({ resultVersion: 1, result: 'HOME_WIN' }),
        after_state: expect.objectContaining({ resultVersion: 2, result: 'AWAY_WIN' }),
      }),
    }));
    expect(fixture.tx.gameResultVerification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'OVERRIDDEN', result_version: 2 }),
    }));
    expect(fixture.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entity_type: 'Game',
        entity_id: approvedGame.id,
        actor_id: '50000000-0000-4000-8000-000000000001',
        actor_role: 'HQ_ADMIN',
        action_source: 'ADMIN_OVERRIDE',
        reason: 'Official replay confirmed the away win.',
        request_id: 'override-request',
        correlation_id: 'case-override-12',
        before_state: expect.objectContaining({ result: 'HOME_WIN', resultVersion: 1 }),
        after_state: expect.objectContaining({
          result: 'AWAY_WIN',
          resultVersion: 2,
          evidenceUrl: 'https://example.test/evidence/replay.mp4',
          reference: 'case-override-12',
          overriddenAt: expect.any(String),
          seriesRecalculation: expect.objectContaining({ homeWins: 0, awayWins: 1 }),
        }),
      }),
    }));
  });

  it('draw in any Game overrides the score and eliminates both participants', async () => {
    const drawGames = [
      ['HOME_WIN', attendancePlayerIds[0]],
      ['DRAW', null],
      ['HOME_WIN', attendancePlayerIds[0]],
    ].map(([result, winner_player_id], index) => ({
      ...createExecutionFixture().games[index],
      status: 'COMPLETED',
      result,
      winner_player_id,
      result_version: 1,
      result_verifications: [{ id: `verified-${index}`, result_version: 1, status: 'APPROVED', reason: null }],
    }));
    const fixture = createExecutionFixture({ games: drawGames });
    const resolution = await fixture.service.completeSeries(attendanceSeriesId, {});

    expect(resolution).toMatchObject({ status: 'ELIMINATED', winnerPlayerId: null, eliminatedPlayerIds: attendancePlayerIds });
    expect(fixture.tx.series.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'ELIMINATED',
        elimination_outcome: 'BOTH_ELIMINATED',
        winner_player_id: null,
      }),
    }));
  });

  it('finalizes and audits a ready Phase with its eligible survivors', async () => {
    const phaseId = '70000000-0000-4000-8000-000000000001';
    const games = [1, 2, 3].map((game_number) => ({
      id: `80000000-0000-4000-8000-00000000000${game_number}`,
      game_number,
      status: 'COMPLETED',
      result: 'HOME_WIN',
      winner_player_id: attendancePlayerIds[0],
      home_player_id: attendancePlayerIds[0],
      away_player_id: attendancePlayerIds[1],
      result_version: 1,
      result_verifications: [{ result_version: 1, status: 'APPROVED' }],
    }));
    const phase = {
      id: phaseId,
      status: 'ACTIVE',
      phase_type: 'FINAL',
      phase_number: 1,
      end_at: new Date('2027-03-30T00:00:00.000Z'),
      configuration: null,
      participating_player_ids: attendancePlayerIds,
      season: {
        start_date: new Date('2027-01-01T00:00:00.000Z'),
        end_date: new Date('2027-03-31T00:00:00.000Z'),
      },
      plots: [{
        id: '90000000-0000-4000-8000-000000000001',
        name: 'Final Plot',
        player_ids: attendancePlayerIds,
        series: [{
          id: attendanceSeriesId,
          status: 'COMPLETED',
          participant_player_ids: attendancePlayerIds,
          winner_player_id: attendancePlayerIds[0],
          eliminated_player_ids: [attendancePlayerIds[1]],
          games,
          resolution_audits: [{
            outcome: 'WINNER_ADVANCES',
            advancing_player_id: attendancePlayerIds[0],
          }],
        }],
      }],
    };
    const tx = {
      phase: {
        findUnique: vi.fn().mockResolvedValue(phase),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      dispute: { findMany: vi.fn().mockResolvedValue([]) },
      penalty: { findMany: vi.fn().mockResolvedValue([]) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'phase-audit' }) },
    };
    const prisma = { $transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx) };
    const service = new CompetitionService(prisma as any, {} as any);

    const result = await service.completePhase(phaseId, { id: 'operator-1', role: 'COMMISSIONER' });

    expect(result).toMatchObject({
      phaseId,
      status: 'COMPLETED',
      advancementEligiblePlayerIds: [attendancePlayerIds[0]],
      nextPhaseTimingFeasible: true,
    });
    expect(tx.phase.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: phaseId, status: 'ACTIVE' },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'PHASE_COMPLETION_FINALIZED',
        entity_id: phaseId,
        actor_id: 'operator-1',
      }),
    }));
  });

  it('rejects a persisted Game with missing participants before planning a Phase transition', async () => {
    const phaseId = '70000000-0000-4000-8000-000000000002';
    const phase = {
      id: phaseId,
      season_id: 'season-transition',
      status: 'COMPLETED',
      phase_type: 'QUALIFYING',
      phase_number: 1,
      end_at: new Date('2027-02-01T00:00:00Z'),
      participating_player_ids: attendancePlayerIds,
      season: {
        id: 'season-transition',
        name: 'Transition Season',
        start_date: new Date('2027-01-01T00:00:00Z'),
        end_date: new Date('2027-03-31T00:00:00Z'),
        competition_timezone: 'UTC',
      },
      plots: [{
        id: '90000000-0000-4000-8000-000000000002',
        player_ids: attendancePlayerIds,
        series: [{
          id: attendanceSeriesId,
          status: 'COMPLETED',
          games: [{
            game_number: 1,
            home_player_id: null,
            away_player_id: attendancePlayerIds[1],
            status: 'COMPLETED',
            result: 'HOME_WIN',
            winner_player_id: attendancePlayerIds[0],
          }],
          resolution_audits: [],
        }],
      }],
    };
    const tx = {
      phase: { findUnique: vi.fn().mockResolvedValue(phase) },
      phaseTransitionAudit: { findUnique: vi.fn().mockResolvedValue(null) },
      phaseTransition: { create: vi.fn() },
    };
    const service = new CompetitionService(
      { $transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx) } as any,
      {} as any,
    );

    await expect(service.generateNextPhase(phaseId, { id: 'operator-1' })).rejects.toThrow(
      `Series ${attendanceSeriesId} Game 1 must have two distinct valid participant IDs before Phase transition.`,
    );
    expect(tx.phaseTransition.create).not.toHaveBeenCalled();
  });

});
