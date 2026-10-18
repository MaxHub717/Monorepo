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

  it('creates a draft season and registration division without rules or legacy fixture configuration', async () => {
    const tx: any = {
      league: { findFirst: vi.fn().mockResolvedValue({ id: 'league-id' }) },
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
      divisionCapacity: 16,
      registrationCapacity: 32,
      competitionParticipantCount: 12,
    });

    expect(tx.division.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        season_id: 'season-id',
        name: 'Division 1',
        capacity: 16,
        registration_capacity: 32,
        competition_participant_count: 12,
      }),
    }));
    expect(tx.season.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'DRAFT',
        name: 'Season Test',
      }),
    }));
    expect(tx.season.create.mock.calls[0][0].data).not.toHaveProperty('ruleset_id');
    const divisionData = tx.division.create.mock.calls[0][0].data;
    for (const key of [
      'format', 'scheduling_period_days', 'matches_per_participant', 'match_window_start_minutes',
      'match_window_end_minutes', 'match_window_timezone', 'concurrent_matches',
    ]) {
      expect(divisionData).not.toHaveProperty(key);
    }
  });

  it('continues rejecting retired density configuration sent directly to season creation', async () => {
    const transaction = vi.fn();
    const service = new SeasonService({ $transaction: transaction } as any, {} as any, {} as any, {} as any);

    await expect(service.createSeason({
      leagueId: '00000000-0000-4000-8000-000000000001',
      name: 'Season Test',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
      schedulingPeriodDays: 7,
    } as any)).rejects.toThrow('legacy Fixture density configuration is retired for createSeason');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('blocks registration and activation when season rules are missing or invalid', async () => {
    const missingRulesTx: any = {
      season: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'season-id', status: 'DRAFT', start_date: new Date('2026-01-01'), end_date: new Date('2026-12-31'), ruleset: null,
        }),
        update: vi.fn(),
      },
    };
    const missingRulesService = new SeasonService(
      { $transaction: (callback: any) => callback(missingRulesTx) } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(missingRulesService.publishSeason('season-id')).rejects.toThrow('Configure and save valid rules');
    expect(missingRulesTx.season.update).not.toHaveBeenCalled();

    const invalidRulesTx: any = {
      season: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'season-id', status: 'ROSTER_LOCKED', ruleset: { season_id: 'season-id', rules: { seriesGameRules: { gamesPerSeries: 2 } } },
        }),
        update: vi.fn(),
      },
    };
    const invalidRulesService = new SeasonService(
      { $transaction: (callback: any) => callback(invalidRulesTx) } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(invalidRulesService.activateSeason('season-id')).rejects.toThrow('Season rules are invalid');
    expect(invalidRulesTx.season.update).not.toHaveBeenCalled();
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
        findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED', ruleset: { season_id: 'season-id', rules: DEFAULT_COMPETITION_RULES } }),
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
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED', ruleset: { season_id: 'season-id', rules: DEFAULT_COMPETITION_RULES } }) },
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
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED', ruleset: { season_id: 'season-id', rules: DEFAULT_COMPETITION_RULES } }) },
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
        findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED', ruleset: { season_id: 'season-id', rules: DEFAULT_COMPETITION_RULES } }),
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
          ruleset: { season_id: 'season-id', rules: DEFAULT_COMPETITION_RULES },
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

describe('SeasonService player-facing season discovery', () => {
  it('shows only open seasons with published rules and active divisions to players', async () => {
    const service = new SeasonService(
      {
        season: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'open-season',
              name: 'Open Season',
              description: 'Visible to players',
              status: 'REGISTRATION_OPEN',
              start_date: new Date('2026-01-01T00:00:00Z'),
              end_date: new Date('2026-02-15T00:00:00Z'),
              registration_open_at: new Date('2025-12-01T00:00:00Z'),
              registration_close_at: new Date('2026-01-20T00:00:00Z'),
              competition_timezone: 'UTC',
              league: { id: 'league-1', name: 'NGL League' },
              ruleset: {
                id: 'ruleset-1',
                season_id: 'open-season',
                name: 'Open Season Rules',
                version: '1.0.0',
                status: 'PUBLISHED',
                rules: DEFAULT_COMPETITION_RULES,
                rules_hash: 'hash-1',
              },
              divisions: [
                {
                  id: 'div-1',
                  name: 'Division One',
                  type: 'COMPETITIVE',
                  capacity: 16,
                  registration_capacity: 16,
                  _count: { participants: 3 },
                },
              ],
            },
            {
              id: 'draft-season',
              name: 'Draft Season',
              description: 'Hidden from players',
              status: 'DRAFT',
              start_date: new Date('2026-01-01T00:00:00Z'),
              end_date: new Date('2026-02-15T00:00:00Z'),
              registration_open_at: null,
              registration_close_at: null,
              competition_timezone: 'UTC',
              league: { id: 'league-1', name: 'NGL League' },
              ruleset: null,
              divisions: [],
            },
            {
              id: 'closed-season',
              name: 'Closed Season',
              description: 'Registration closed',
              status: 'REGISTRATION_OPEN',
              start_date: new Date('2026-01-01T00:00:00Z'),
              end_date: new Date('2026-02-15T00:00:00Z'),
              registration_open_at: new Date('2025-12-01T00:00:00Z'),
              registration_close_at: new Date('2025-12-10T00:00:00Z'),
              competition_timezone: 'UTC',
              league: { id: 'league-1', name: 'NGL League' },
              ruleset: null,
              divisions: [{
                id: 'div-2',
                name: 'Division Two',
                type: 'AMATEUR',
                capacity: 8,
                registration_capacity: 8,
                _count: { participants: 8 },
              }],
            },
          ]),
        },
      } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.listOpenRegistrationSeasons();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'open-season',
      name: 'Open Season',
      status: 'REGISTRATION_OPEN',
      rules: {
        available: true,
        name: 'Open Season Rules',
      },
    });
    expect(result[0].divisions).toEqual([
      expect.objectContaining({
        id: 'div-1',
        name: 'Division One',
        registrationCapacity: 16,
      }),
    ]);
  });
});

describe('SeasonService public and registration discovery', () => {
  it('exposes an admin-created season to public discovery only after publication', async () => {
    let storedSeason: any = null;
    const prisma: any = {
      $transaction: (callback: any) => callback(prisma),
      league: { findFirst: vi.fn().mockResolvedValue({ id: 'league-public', status: 'ACTIVE', deleted_at: null }) },
      division: { create: vi.fn().mockResolvedValue({ id: 'division-public' }) },
      season: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          storedSeason = {
            id: 'season-admin-created',
            ...data,
            registration_open_at: null,
            registration_close_at: null,
            competition_timezone: 'UTC',
            deleted_at: null,
            internal_config: { private: true },
            league: { id: 'league-public', name: 'Public League', status: 'ACTIVE', deleted_at: null },
            ruleset: { season_id: 'season-admin-created', rules: DEFAULT_COMPETITION_RULES },
            divisions: [{ id: 'division-public', name: 'Division One', type: 'COMPETITIVE', active: true }],
          };
          return storedSeason;
        }),
        findUnique: vi.fn().mockImplementation(async () => storedSeason),
        update: vi.fn().mockImplementation(async ({ data }) => {
          storedSeason = { ...storedSeason, ...data };
          return storedSeason;
        }),
        findMany: vi.fn().mockImplementation(async ({ where }) => (
          storedSeason && where.status.not === 'DRAFT' && storedSeason.status !== 'DRAFT' ? [storedSeason] : []
        )),
      },
    };
    const outbox = { enqueueEvent: vi.fn().mockResolvedValue(undefined) };
    const audit = { writeLog: vi.fn().mockResolvedValue(undefined) };
    const service = new SeasonService(prisma, outbox as any, audit as any, {} as any);

    await service.createSeason({
      leagueId: 'league-public',
      name: 'Admin Created Season',
      startDate: '2027-01-01T00:00:00.000Z',
      endDate: '2027-12-31T00:00:00.000Z',
      divisionCapacity: 16,
    });
    expect(await service.listPublicSeasons()).toEqual([]);

    const published = await service.publishSeason('season-admin-created', { id: 'admin-1', role: 'HQ_ADMIN' });
    const publicSeasons = await service.listPublicSeasons();

    expect(published.status).toBe('REGISTRATION_OPEN');
    expect(publicSeasons).toEqual([expect.objectContaining({
      id: 'season-admin-created',
      name: 'Admin Created Season',
      status: 'REGISTRATION_OPEN',
    })]);
    expect(publicSeasons[0]).not.toHaveProperty('internal_config');
    expect(prisma.season.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { not: 'DRAFT' },
        deleted_at: null,
        league: { is: { status: 'ACTIVE', deleted_at: null } },
      }),
    }));
  });

  it('keeps a season public after its registration close time has passed', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: 'season-closed',
      name: 'NGL 2026 SEASON 1',
      description: 'Public season with registration closed',
      status: 'REGISTRATION_OPEN',
      start_date: new Date('2026-10-14T00:00:00.000Z'),
      end_date: new Date('2026-10-28T00:00:00.000Z'),
      registration_open_at: new Date('2026-10-12T19:35:17.610Z'),
      registration_close_at: new Date('2026-10-13T00:00:00.000Z'),
      competition_timezone: 'UTC',
      deleted_at: null,
      internal_config: { hidden: true },
      league: { id: 'league-1', name: 'NGL League' },
      divisions: [{ id: 'division-1', name: 'Division 1', type: 'COMPETITIVE' }],
    }]);
    const service = new SeasonService(
      { season: { findMany } } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.listPublicSeasons();

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: { not: 'DRAFT' },
        deleted_at: null,
        league: { is: { status: 'ACTIVE', deleted_at: null } },
      },
    }));
    expect(result).toEqual([expect.objectContaining({
      id: 'season-closed',
      name: 'NGL 2026 SEASON 1',
      status: 'REGISTRATION_OPEN',
      registrationCloseAt: new Date('2026-10-13T00:00:00.000Z'),
      divisions: [{ id: 'division-1', name: 'Division 1', type: 'COMPETITIVE' }],
    })]);
    expect(result[0]).not.toHaveProperty('internal_config');
  });

  it('returns public overview empty states and only the selected season published rules', async () => {
    const season: any = {
      id: 'season-public',
      name: 'Public Season',
      description: 'Season overview',
      status: 'REGISTRATION_OPEN',
      start_date: new Date('2026-10-14T00:00:00.000Z'),
      end_date: new Date('2026-10-28T00:00:00.000Z'),
      competition_timezone: 'UTC',
      league: { id: 'league-1', name: 'NGL League' },
      ruleset_name: null,
      ruleset_version: null,
      ruleset: {
        season_id: 'season-public',
        legacy_unassigned: false,
        name: 'Public Season Rules',
        version: '1.0.0',
        status: 'DRAFT',
        rules: DEFAULT_COMPETITION_RULES,
        published_at: null,
      },
      divisions: [],
      phases: [],
    };
    const findFirst = vi.fn().mockResolvedValue(season);
    const service = new SeasonService(
      { season: { findFirst } } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const draftOverview = await service.getPublicSeasonOverview('season-public');
    expect(draftOverview).toMatchObject({
      participantCount: 0,
      phases: [],
      scheduledSeriesCount: 0,
      publishedResultsCount: 0,
      publishedRules: null,
      rulesPublishedAt: null,
    });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'season-public',
        status: { not: 'DRAFT' },
        deleted_at: null,
        league: { is: { status: 'ACTIVE', deleted_at: null } },
      },
      select: expect.not.objectContaining({ competition_config: true }),
    }));

    season.ruleset = { ...season.ruleset, status: 'PUBLISHED', published_at: new Date('2026-10-09T12:00:00.000Z') };
    season.divisions = [{
      id: 'division-1',
      name: 'Division One',
      type: 'COMPETITIVE',
      _count: { participants: 2 },
    }];
    season.phases = [{
      phase_number: 1,
      phase_type: 'QUALIFYING',
      name: null,
      status: 'ACTIVE',
      start_at: new Date('2026-10-14T00:00:00.000Z'),
      end_at: new Date('2026-10-21T00:00:00.000Z'),
      series: [{ status: 'SCHEDULED', match_window_start: new Date('2026-10-16T12:00:00.000Z'), games: [] }],
    }];
    const populatedOverview = await service.getPublicSeasonOverview('season-public');
    expect(populatedOverview).toMatchObject({
      participantCount: 2,
      phases: [{ name: 'Phase 1', seriesCount: 1, scheduledSeriesCount: 1 }],
      scheduledSeriesCount: 1,
      publishedRules: expect.objectContaining({ name: 'Public Season Rules', version: '1.0.0' }),
      rulesPublishedAt: new Date('2026-10-09T12:00:00.000Z'),
    });

    season.ruleset = { ...season.ruleset, season_id: 'another-season' };
    const mismatchedRulesOverview = await service.getPublicSeasonOverview('season-public');
    expect(mismatchedRulesOverview.publishedRules).toBeNull();
  });

  it('returns one publicly visible season without internal fields', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'season-public',
      name: 'Published Season',
      description: 'Public details',
      status: 'REGISTRATION_CLOSED',
      start_date: new Date('2026-10-14T00:00:00.000Z'),
      end_date: new Date('2026-10-28T00:00:00.000Z'),
      registration_open_at: null,
      registration_close_at: null,
      competition_timezone: 'UTC',
      league: { id: 'league-1', name: 'NGL League' },
      divisions: [{ id: 'division-1', name: 'Division 1', type: 'COMPETITIVE' }],
    });
    const service = new SeasonService(
      { season: { findFirst } } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.getPublicSeason('season-public');

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'season-public',
        status: { not: 'DRAFT' },
        deleted_at: null,
        league: { is: { status: 'ACTIVE', deleted_at: null } },
      },
      select: expect.not.objectContaining({ competition_config: true, ruleset: true }),
    }));
    expect(result).toMatchObject({ id: 'season-public', status: 'REGISTRATION_CLOSED' });
    expect(result).not.toHaveProperty('competition_config');
    expect(result).not.toHaveProperty('ruleset');
  });

  it('queries registration discovery with status, date, close-time, and active-division gates', async () => {
    const now = new Date('2026-10-16T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const findMany = vi.fn().mockResolvedValue([]);
      const service = new SeasonService(
        { season: { findMany } } as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await service.listOpenRegistrationSeasons();

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          status: 'REGISTRATION_OPEN',
          start_date: { not: null },
          end_date: { not: null },
          OR: [{ registration_close_at: null }, { registration_close_at: { gt: now } }],
        },
        select: expect.objectContaining({
          divisions: expect.objectContaining({
            where: { active: true },
            select: expect.objectContaining({
              _count: { select: { participants: { where: { status: 'ACTIVE' } } } },
            }),
          }),
        }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('omits missing-date seasons and seasons whose active divisions are all full', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'missing-start',
        start_date: null,
        end_date: new Date('2026-12-31T00:00:00.000Z'),
        divisions: [{ registration_capacity: null, _count: { participants: 0 } }],
      },
      {
        id: 'full-season',
        start_date: new Date('2026-10-14T00:00:00.000Z'),
        end_date: new Date('2026-10-28T00:00:00.000Z'),
        divisions: [{ registration_capacity: 20, _count: { participants: 20 } }],
      },
      {
        id: 'inactive-only-season',
        start_date: new Date('2026-10-14T00:00:00.000Z'),
        end_date: new Date('2026-10-28T00:00:00.000Z'),
        divisions: [],
      },
      {
        id: 'available-season',
        start_date: new Date('2026-10-14T00:00:00.000Z'),
        end_date: new Date('2026-10-28T00:00:00.000Z'),
        divisions: [{ registration_capacity: 20, _count: { participants: 19 } }],
      },
      {
        id: 'unlimited-season',
        start_date: new Date('2026-10-14T00:00:00.000Z'),
        end_date: new Date('2026-10-28T00:00:00.000Z'),
        divisions: [{ registration_capacity: null, _count: { participants: 100 } }],
      },
    ]);
    const service = new SeasonService(
      { season: { findMany } } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.listOpenRegistrationSeasons();

    expect(result.map((season) => season.id)).toEqual(['available-season', 'unlimited-season']);
    expect(result[0].divisions[0].availableSlots).toBe(1);
    expect(result[1].divisions[0].availableSlots).toBeNull();
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
          ruleset: { id: 'ruleset-id', season_id: 'season-id', name: 'Season 1 Rules', version: '1.0.0', status: 'DRAFT', rules: DEFAULT_COMPETITION_RULES, rules_hash: null, published_at: null },
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