import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeasonService } from './season.service.js';
import { expectedRoundRobinFixtureCount, MAX_FIXTURES_PER_GENERATION } from './competition-field.js';
import { DEFAULT_COMPETITION_RULES } from '../competition/competition.domain.js';

describe('competition format handling', () => {
  it('calculates both approved round-robin fixture counts explicitly', () => {
    expect(expectedRoundRobinFixtureCount(8, 'ROUND_ROBIN_SINGLE' as any)).toBe(28);
    expect(expectedRoundRobinFixtureCount(8, 'ROUND_ROBIN_DOUBLE' as any)).toBe(56);
    expect(() => expectedRoundRobinFixtureCount(8, 'SWISS' as any)).toThrow('Unsupported competition format');
  });

  it('persists an explicitly selected format when creating a season', async () => {
    const tx: any = {
      league: { findFirst: vi.fn().mockResolvedValue({ id: 'league-id' }) },
      competitionRuleset: { findFirst: vi.fn().mockResolvedValue({
        id: 'ruleset-id', name: 'Standard Competition', version: '1.0.0', status: 'PUBLISHED', rules: DEFAULT_COMPETITION_RULES, rules_hash: 'hash-1',
      }) },
      season: { create: vi.fn().mockResolvedValue({ id: 'season-id' }) },
      division: { create: vi.fn().mockResolvedValue({ id: 'division-id' }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-id' }) },
    };
    const outbox = { enqueueEvent: vi.fn() };
    const service = new SeasonService(
      { $transaction: (callback: any) => callback(tx) } as any,
      outbox as any,
      {} as any,
      {} as any,
    );

    await service.createSeason({
      leagueId: '00000000-0000-4000-8000-000000000001',
      name: 'Season Test',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
      divisionFormat: 'ROUND_ROBIN_DOUBLE',
    });

    expect(tx.division.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ format: 'ROUND_ROBIN_DOUBLE' }),
    }));
    expect(tx.season.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ruleset_id: 'ruleset-id',
        ruleset_name: 'Standard Competition',
        ruleset_version: '1.0.0',
        competition_config: expect.objectContaining({ rules: DEFAULT_COMPETITION_RULES, rulesHash: 'hash-1' }),
      }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'SEASON_RULESET_ATTACHED',
        after_state: expect.objectContaining({ rulesetId: 'ruleset-id', rulesetVersion: '1.0.0' }),
      }),
    }));
  });

  it('rejects changing format after a division has fixtures', async () => {
    const tx: any = {
      division: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'division-id',
          format: 'ROUND_ROBIN_SINGLE',
          season: { status: 'DRAFT' },
        }),
        update: vi.fn(),
      },
      fixture: { count: vi.fn().mockResolvedValue(1) },
    };
    const service = new SeasonService(
      { $transaction: (callback: any) => callback(tx) } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.updateDivision('division-id', { format: 'ROUND_ROBIN_DOUBLE' })).rejects.toThrow(
      'Competition format cannot be changed after fixtures have been created',
    );
    expect(tx.division.update).not.toHaveBeenCalled();
  });

  it('uses double-round-robin count during the backend activation transition', async () => {
    const participants = Array.from({ length: 4 }, (_, index) => ({
      player_id: `player-${index + 1}`,
      seed: index + 1,
      registered_at: new Date(`2026-01-0${index + 1}T00:00:00Z`),
      competition_selected: true,
    }));
    const tx: any = {
      season: {
        findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }),
        update: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ACTIVE' }),
      },
      phase: { findMany: vi.fn().mockResolvedValue([]) },
      division: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'division-id',
          name: 'Division 1',
          format: 'ROUND_ROBIN_DOUBLE',
          capacity: 4,
          competition_participant_count: 4,
          schedule_locked: true,
          schedule_validation_required: false,
          participants,
        }]),
      },
      divisionParticipant: { findMany: vi.fn().mockResolvedValue(participants) },
      fixture: { count: vi.fn(({ where }: any) => where.OR ? 0 : 12) },
    };
    const fixtureService = {
      validateDivisionSchedule: vi.fn().mockResolvedValue({
        valid: true,
        summary: { fixtures: 12, scheduled: 12, errors: 0, warnings: 0, conflicts: 0 },
      }),
    };
    const service = new SeasonService(
      { $transaction: (callback: any) => callback(tx) } as any,
      { enqueueEvent: vi.fn() } as any,
      { writeLog: vi.fn() } as any,
      fixtureService as any,
    );

    const result = await service.activateSeason('season-id');

    expect(result.status).toBe('ACTIVE');
    expect(tx.fixture.count).toHaveBeenCalledWith({ where: { division: { season_id: 'season-id' } } });
    expect(fixtureService.validateDivisionSchedule).toHaveBeenCalledWith(
      'season-id',
      'division-id',
      undefined,
      tx,
    );
  });

  it('rejects activation when a schedule has not been locked', async () => {
    const tx: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      phase: { findMany: vi.fn().mockResolvedValue([]) },
      division: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'division-id',
          name: 'Division 1',
          format: 'ROUND_ROBIN_SINGLE',
          capacity: 2,
          competition_participant_count: 2,
          schedule_locked: false,
          schedule_validation_required: false,
          participants: ['player-a', 'player-b'].map((player_id, index) => ({
            player_id, seed: index + 1, registered_at: new Date(`2026-01-0${index + 1}T00:00:00Z`), competition_selected: true,
          })),
        }]),
      },
      fixture: { count: vi.fn().mockResolvedValue(1) },
      seasonUpdate: vi.fn(),
    };
    tx.season.update = tx.seasonUpdate;
    const fixtureService = { validateDivisionSchedule: vi.fn() };
    const service = new SeasonService(
      { $transaction: (callback: any) => callback(tx) } as any,
      {} as any,
      {} as any,
      fixtureService as any,
    );

    await expect(service.activateSeason('season-id')).rejects.toThrow(
      'Division 1 schedule must be locked before activation',
    );
    expect(fixtureService.validateDivisionSchedule).not.toHaveBeenCalled();
    expect(tx.season.update).not.toHaveBeenCalled();
  });

  it('rejects activation when a locked schedule still requires validation', async () => {
    const tx: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      phase: { findMany: vi.fn().mockResolvedValue([]) },
      division: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'division-id',
          name: 'Division 1',
          format: 'ROUND_ROBIN_SINGLE',
          capacity: 2,
          competition_participant_count: 2,
          schedule_locked: true,
          schedule_validation_required: true,
          participants: ['player-a', 'player-b'].map((player_id, index) => ({
            player_id, seed: index + 1, registered_at: new Date(`2026-01-0${index + 1}T00:00:00Z`), competition_selected: true,
          })),
        }]),
      },
      fixture: { count: vi.fn().mockResolvedValue(1) },
      seasonUpdate: vi.fn(),
    };
    tx.season.update = tx.seasonUpdate;
    const fixtureService = { validateDivisionSchedule: vi.fn() };
    const service = new SeasonService(
      { $transaction: (callback: any) => callback(tx) } as any,
      {} as any,
      {} as any,
      fixtureService as any,
    );

    await expect(service.activateSeason('season-id')).rejects.toThrow(
      'Division 1 schedule requires validation before activation',
    );
    expect(fixtureService.validateDivisionSchedule).not.toHaveBeenCalled();
    expect(tx.season.update).not.toHaveBeenCalled();
  });

  it('rejects activation if a locked schedule fails current whole-schedule validation', async () => {
    const participants = ['player-a', 'player-b'].map((player_id, index) => ({
      player_id,
      seed: index + 1,
      registered_at: new Date(`2026-01-0${index + 1}T00:00:00Z`),
      competition_selected: true,
    }));
    const tx: any = {
      season: {
        findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }),
        update: vi.fn(),
      },
      phase: { findMany: vi.fn().mockResolvedValue([]) },
      division: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'division-id',
          name: 'Division 1',
          format: 'ROUND_ROBIN_SINGLE',
          capacity: 2,
          competition_participant_count: 2,
          schedule_locked: true,
          schedule_validation_required: false,
          participants,
        }]),
      },
      divisionParticipant: { findMany: vi.fn().mockResolvedValue(participants) },
      fixture: { count: vi.fn(({ where }: any) => where.OR ? 0 : 1) },
    };
    const fixtureService = {
      validateDivisionSchedule: vi.fn().mockResolvedValue({
        valid: false,
        errors: ['Fixture appointment is missing its play window.'],
        summary: { fixtures: 1, scheduled: 0, errors: 1, warnings: 0, conflicts: 0 },
      }),
    };
    const service = new SeasonService(
      { $transaction: (callback: any) => callback(tx) } as any,
      {} as any,
      {} as any,
      fixtureService as any,
    );

    await expect(service.activateSeason('season-id')).rejects.toThrow(
      'Division 1 schedule is not valid and cannot be activated: Fixture appointment is missing its play window.',
    );
    expect(fixtureService.validateDivisionSchedule).toHaveBeenCalledWith(
      'season-id',
      'division-id',
      undefined,
      tx,
    );
    expect(tx.season.update).not.toHaveBeenCalled();
  });

  it('blocks activation of a field above the safe fixture-generation workload', async () => {
    const participants = Array.from({ length: 2000 }, (_, index) => ({
      player_id: `player-${String(index + 1).padStart(4, '0')}`,
      seed: null,
      registered_at: new Date('2026-01-01T00:00:00Z'),
      competition_selected: true,
    }));

    const fixtureCount = vi.fn();

    const tx: any = {
      season: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'season-id',
          status: 'ROSTER_LOCKED',
        }),
      },
      phase: { findMany: vi.fn().mockResolvedValue([]) },
      division: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'division-id',
          name: 'Division 1',
          format: 'ROUND_ROBIN_DOUBLE',
          capacity: 2000,
          competition_participant_count: 2000,
          schedule_locked: true,
          participants,
        }]),
      },
      divisionParticipant: {
        findMany: vi.fn().mockResolvedValue(participants),
      },
      fixture: {
        count: fixtureCount,
      },
    };

    const service = new SeasonService(
      { $transaction: (callback: any) => callback(tx) } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.activateSeason('season-id')).rejects.toThrow(
      `above the per-transaction generation limit of ${MAX_FIXTURES_PER_GENERATION}`,
    );

    // Oversized fixture workloads must be rejected before fixture inspection.
    expect(fixtureCount).not.toHaveBeenCalled();
  });
});

describe('SeasonService competition-field activation readiness', () => {
  const eligibleParticipants = Array.from({ length: 64 }, (_, index) => ({
    player_id: `player-${index + 1}`,
    seed: index + 1,
    registered_at: new Date(`2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z`),
    competition_selected: true,
  }));

  let service: SeasonService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      season: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'season-id',
          name: 'Season 1',
          description: null,
          status: 'ROSTER_LOCKED',
          start_date: new Date('2026-01-01T00:00:00Z'),
          end_date: new Date('2026-12-31T00:00:00Z'),
          competition_timezone: 'UTC',
          registration_open_at: null,
          registration_close_at: null,
          league: { id: 'league-id', name: 'NGL Professional', status: 'ACTIVE' },
          divisions: [],
          _count: { participants: 1850, divisions: 1, matches: 2016, standings_rows: 64 },
        }),
      },
      division: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'division-id',
          name: 'Division 1',
          format: 'ROUND_ROBIN_SINGLE',
          capacity: 64,
          competition_participant_count: 64,
          schedule_locked: true,
          participants: eligibleParticipants,
          _count: { fixtures: 2016 },
        }]),
      },
      fixture: {
        count: vi.fn(({ where }: any) => where.OR ? 0 : 2016),
      },
      phase: { findMany: vi.fn().mockResolvedValue([]) },
      match: { count: vi.fn().mockResolvedValue(0) },
      dispute: { count: vi.fn().mockResolvedValue(0) },
      penalty: { count: vi.fn().mockResolvedValue(0) },
    };

    service = new SeasonService(
      prisma,
      { enqueueEvent: vi.fn() } as any,
      { writeLog: vi.fn() } as any,
      { validateDivisionSchedule: vi.fn() } as any,
    );
  });

  it('allows activation readiness for a 64-player field inside an 1,850-player registration pool', async () => {
    const overview = await service.getOverview('season-id');

    expect(overview.readiness).toEqual({ canAdvance: true, issues: [] });
    expect(prisma.division.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        participants: expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            player: expect.objectContaining({
              is: expect.objectContaining({
                verification_status: 'VERIFIED',
              }),
            }),
          }),
        }),
      }),
    }));
  });

  it('blocks activation when the selected competition field does not match its configured size', async () => {
    prisma.division.findMany.mockResolvedValue([{
      id: 'division-id',
      name: 'Division 1',
      format: 'ROUND_ROBIN_SINGLE',
      capacity: 64,
      competition_participant_count: 64,
      participants: eligibleParticipants.slice(1),
      _count: { fixtures: 2016 },
    }]);

    const overview = await service.getOverview('season-id');

    expect(overview.readiness.canAdvance).toBe(false);
    expect(overview.readiness.issues).toContain(
      'Division 1 needs 64 eligible participants for its configured competition field; found 63.',
    );
  });

  it('blocks activation when the selected count is right but the deterministic participants are wrong', async () => {
    const sixtyFiveEligibleParticipants = [
      ...eligibleParticipants,
      {
        player_id: 'player-65',
        seed: 65,
        registered_at: new Date('2026-01-29T00:00:00Z'),
        competition_selected: false,
      },
    ];

    const wrongSelectedParticipants = sixtyFiveEligibleParticipants.map((participant) => ({
      ...participant,
      // Deliberately omit the highest-priority participant (player-1)
      // and select player-65 instead.
      competition_selected: participant.player_id !== 'player-1',
    }));

    prisma.division.findMany.mockResolvedValue([{
      id: 'division-id',
      name: 'Division 1',
      format: 'ROUND_ROBIN_SINGLE',
      capacity: 64,
      competition_participant_count: 64,
      participants: wrongSelectedParticipants,
      _count: { fixtures: 2016 },
    }]);

    const overview = await service.getOverview('season-id');

    expect(overview.readiness.canAdvance).toBe(false);
    expect(overview.readiness.issues).toContain(
      'Division 1 selected participants do not match the deterministic competition field.',
    );
  });

  it('blocks activation readiness for an oversized resolved field', async () => {
    const oversizedField = Array.from({ length: 2000 }, (_, index) => ({
      player_id: `player-${String(index + 1).padStart(4, '0')}`,
      seed: index + 1,
      registered_at: new Date('2026-01-01T00:00:00Z'),
      competition_selected: true,
    }));

    prisma.division.findMany.mockResolvedValue([{
      id: 'division-id',
      name: 'Division 1',
      format: 'ROUND_ROBIN_DOUBLE',
      capacity: 2000,
      competition_participant_count: null,
      participants: oversizedField,
      _count: { fixtures: 0 },
    }]);

    prisma.fixture.count.mockImplementation(({ where }: any) => where.OR ? 0 : 0);

    const overview = await service.getOverview('season-id');

    expect(overview.readiness.canAdvance).toBe(false);
    expect(
      overview.readiness.issues.some(
        (issue: string) => issue.includes('above the per-transaction generation limit'),
      ),
    ).toBe(true);
  });

  it('blocks canonical readiness when Phases are missing and the season has no legacy fixture schedule', async () => {
    prisma.fixture.count.mockReturnValue(0);
    prisma.division.findMany.mockResolvedValue([{
      id: 'division-id', name: 'Division 1', format: 'ROUND_ROBIN_SINGLE', capacity: 64,
      competition_participant_count: 64, schedule_locked: false, schedule_validation_required: true,
      participants: eligibleParticipants,
    }]);

    const overview = await service.getOverview('season-id');

    expect(overview.readiness.canAdvance).toBe(false);
    expect(overview.readiness.issues).toContain('Generate the canonical Phase structure before activating this Season.');
  });

  it('blocks an unlocked canonical Phase schedule', async () => {
    prisma.fixture.count.mockReturnValue(0);
    prisma.division.findMany.mockResolvedValue([{
      id: 'division-id', name: 'Division 1', format: 'ROUND_ROBIN_SINGLE', capacity: 64,
      competition_participant_count: 64, schedule_locked: false, participants: eligibleParticipants,
    }]);
    prisma.phase.findMany.mockResolvedValue([canonicalPhase(false)]);

    const overview = await service.getOverview('season-id');

    expect(overview.readiness.canAdvance).toBe(false);
    expect(overview.readiness.issues).toContain('Every Phase schedule must be validated and locked before Season activation.');
  });

  it('blocks a locked canonical Phase with invalid appointments', async () => {
    prisma.fixture.count.mockReturnValue(0);
    prisma.division.findMany.mockResolvedValue([{
      id: 'division-id', name: 'Division 1', format: 'ROUND_ROBIN_SINGLE', capacity: 64,
      competition_participant_count: 64, schedule_locked: false, participants: eligibleParticipants,
    }]);
    prisma.phase.findMany.mockResolvedValue([canonicalPhase(true, false)]);

    const overview = await service.getOverview('season-id');

    expect(overview.readiness.canAdvance).toBe(false);
    expect(overview.readiness.issues.some((issue: string) => issue.includes('series-id'))).toBe(true);
  });

  it('accepts a valid locked canonical Phase schedule', async () => {
    prisma.fixture.count.mockReturnValue(0);
    prisma.division.findMany.mockResolvedValue([{
      id: 'division-id', name: 'Division 1', format: 'ROUND_ROBIN_SINGLE', capacity: 64,
      competition_participant_count: 64, schedule_locked: false, participants: eligibleParticipants,
    }]);
    prisma.phase.findMany.mockResolvedValue([canonicalPhase(true, true)]);

    const overview = await service.getOverview('season-id');

    expect(overview.readiness).toEqual({ canAdvance: true, issues: [] });
  });
});

function canonicalPhase(schedule_locked: boolean, includeAppointment = true) {
  return {
    id: 'phase-id',
    phase_number: 1,
    start_at: new Date('2026-01-01T00:00:00Z'),
    end_at: new Date('2026-12-31T00:00:00Z'),
    schedule_locked,
    plots: [{
      id: 'plot-id',
      player_ids: ['player-1', 'player-2'],
      series: [{
        id: 'series-id',
        participant_player_ids: ['player-1', 'player-2'],
        schedule_key: 'series-id:schedule',
        check_in_opens_at: includeAppointment ? new Date('2026-01-05T09:00:00Z') : null,
        check_in_closes_at: includeAppointment ? new Date('2026-01-05T09:30:00Z') : null,
        match_window_start: includeAppointment ? new Date('2026-01-05T10:00:00Z') : null,
        match_window_end: includeAppointment ? new Date('2026-01-05T11:00:00Z') : null,
        results_deadline_at: includeAppointment ? new Date('2026-01-05T11:30:00Z') : null,
        match_window_timezone: 'UTC',
        games: [1, 2, 3].map((game_number) => ({ game_number })),
      }],
    }],
  };
}