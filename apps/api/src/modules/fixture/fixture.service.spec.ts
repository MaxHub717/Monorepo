import { describe, expect, it, vi } from 'vitest';
import { FixtureService, buildRoundRobin, distributeFixtures, ensureMatchWeeks, validateGeneratedSchedule } from './fixture.service.js';
import { MAX_FIXTURES_PER_GENERATION, resolveCompetitionParticipantCount } from '../season/competition-field.js';

describe('ensureMatchWeeks', () => {
  it('reuses existing weeks and only creates missing week numbers', async () => {
    const existing = new Map([
      [1, { id: 'week-1', week_number: 1 }],
      [3, { id: 'week-3', week_number: 3 }],
    ]);
    const upsert = vi.fn(async ({ where, create }: any) => {
      const key = where.season_id_division_id_week_number.week_number;
      return existing.get(key) ?? { id: `week-${key}`, week_number: create.week_number };
    });

    await ensureMatchWeeks(
      { matchWeek: { upsert } } as any,
      'season-1',
      'division-1',
      3,
    );

    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert).toHaveBeenNthCalledWith(1, {
      where: {
        season_id_division_id_week_number: {
          season_id: 'season-1',
          division_id: 'division-1',
          week_number: 1,
        },
      },
      update: {},
      create: {
        season_id: 'season-1',
        division_id: 'division-1',
        week_number: 1,
      },
    });
    expect(upsert).toHaveBeenNthCalledWith(3, {
      where: {
        season_id_division_id_week_number: {
          season_id: 'season-1',
          division_id: 'division-1',
          week_number: 3,
        },
      },
      update: {},
      create: {
        season_id: 'season-1',
        division_id: 'division-1',
        week_number: 3,
      },
    });
  });
});

describe('buildRoundRobin', () => {
  it('creates one round-robin match for every pair when the participant count is even', () => {
    const schedule = buildRoundRobin(['A', 'B', 'C', 'D'], 'ROUND_ROBIN_SINGLE' as any);
    expect(schedule).toHaveLength(6);
    expect(new Set(schedule.map((p) => [p.homePlayerId, p.awayPlayerId].sort().join('-'))).size).toBe(6);
    expect(new Set(schedule.map((p) => p.round)).size).toBe(3);
  });

  it('creates byes when the participant count is odd', () => {
    const schedule = buildRoundRobin(['A', 'B', 'C', 'D', 'E'], 'ROUND_ROBIN_SINGLE' as any);
    expect(schedule).toHaveLength(10);
    expect(new Set(schedule.map((p) => p.round)).size).toBe(5);
  });

  it('creates a second reversed leg for double round robin', () => {
    const schedule = buildRoundRobin(['A', 'B', 'C', 'D'], 'ROUND_ROBIN_DOUBLE' as any);
    expect(schedule).toHaveLength(12);
    expect(schedule.filter((p) => p.leg === 1)).toHaveLength(6);
    expect(schedule.filter((p) => p.leg === 2)).toHaveLength(6);

    const legs = new Map<string, { home: string; away: string }[]>();
    for (const p of schedule) {
      const key = [p.homePlayerId, p.awayPlayerId].sort().join('-');
      const existing = legs.get(key) ?? [];
      existing.push({ home: p.homePlayerId, away: p.awayPlayerId });
      legs.set(key, existing);
    }
    for (const pair of legs.values()) {
      expect(pair).toHaveLength(2);
      expect(pair[0].home).toBe(pair[1].away);
      expect(pair[0].away).toBe(pair[1].home);
    }
  });

  it('rejects unsupported competition formats instead of treating them as single round robin', () => {
    expect(() => buildRoundRobin(['A', 'B', 'C'], 'SWISS' as any)).toThrow('Unsupported competition format');
  });
});

describe('resolveCompetitionParticipantCount', () => {
  it('bounds a large registration pool by the configured competition field', () => {
    expect(resolveCompetitionParticipantCount({ capacity: 8, competition_participant_count: null }, 100)).toBe(8);
    expect(resolveCompetitionParticipantCount({ capacity: 100, competition_participant_count: 16 }, 1000)).toBe(16);
  });

  it('uses every eligible participant when no competition bound is configured', () => {
    expect(resolveCompetitionParticipantCount({ capacity: null, competition_participant_count: null }, 1000)).toBe(1000);
  });
});

describe('distributeFixtures', () => {
  it('keeps all 28 fixtures for eight participants and targets one match across seven periods', () => {
    const playerIds = Array.from({ length: 8 }, (_, index) => `player-${index + 1}`);
    const pairings = buildRoundRobin(playerIds, 'ROUND_ROBIN_SINGLE' as any);
    const distributed = distributeFixtures(pairings, 1, 1);
    const matchesByPlayerAndPeriod = new Map<string, number>();
    const fixturesByPeriodAndSlot = new Map<string, number>();

    for (const fixture of distributed) {
      for (const playerId of [fixture.homePlayerId, fixture.awayPlayerId]) {
        const key = `${playerId}:${fixture.schedulingPeriod}`;
        matchesByPlayerAndPeriod.set(key, (matchesByPlayerAndPeriod.get(key) ?? 0) + 1);
      }
      const slotKey = `${fixture.schedulingPeriod}:${fixture.concurrencySlot}`;
      fixturesByPeriodAndSlot.set(slotKey, (fixturesByPeriodAndSlot.get(slotKey) ?? 0) + 1);
    }

    expect(distributed).toHaveLength(28);
    expect(new Set(distributed.map(({ schedulingPeriod }) => schedulingPeriod)).size).toBe(7);
    expect(new Set(distributed.map(({ homePlayerId, awayPlayerId }) => [homePlayerId, awayPlayerId].sort().join(':'))).size).toBe(28);
    expect(Math.max(...matchesByPlayerAndPeriod.values())).toBe(1);
    expect(Math.max(...fixturesByPeriodAndSlot.values())).toBe(1);
    for (const playerId of playerIds) {
      const appearances = [...matchesByPlayerAndPeriod.entries()]
        .filter(([key]) => key.startsWith(`${playerId}:`))
        .reduce((sum, [, count]) => sum + count, 0);
      expect(appearances).toBe(7);
    }
  });

  it('preserves every double-round-robin fixture and caps only simultaneous slot size', () => {
    const playerIds = Array.from({ length: 8 }, (_, index) => `player-${index + 1}`);
    const pairings = buildRoundRobin(playerIds, 'ROUND_ROBIN_DOUBLE' as any);
    const distributed = distributeFixtures(pairings, 3, 2);
    const fixturesByPeriodAndSlot = new Map<string, number>();
    const playersByPeriodAndSlot = new Map<string, Set<string>>();

    for (const fixture of distributed) {
      const key = `${fixture.schedulingPeriod}:${fixture.concurrencySlot}`;
      fixturesByPeriodAndSlot.set(key, (fixturesByPeriodAndSlot.get(key) ?? 0) + 1);
      const players = playersByPeriodAndSlot.get(key) ?? new Set<string>();
      players.add(fixture.homePlayerId);
      players.add(fixture.awayPlayerId);
      playersByPeriodAndSlot.set(key, players);
    }

    expect(distributed).toHaveLength(56);
    expect(new Set(distributed.map(({ schedulingPeriod }) => schedulingPeriod)).size).toBe(5);
    expect(Math.max(...fixturesByPeriodAndSlot.values())).toBeLessThanOrEqual(2);
    expect([...playersByPeriodAndSlot.entries()].every(([key, players]) =>
      players.size === (fixturesByPeriodAndSlot.get(key) ?? 0) * 2,
    )).toBe(true);
  });
});

describe('validateGeneratedSchedule', () => {
  it('warns when a complete schedule exceeds the density target without invalidating it', () => {
    const playerIds = ['A', 'B', 'C', 'D'];
    const pairings = distributeFixtures(buildRoundRobin(playerIds, 'ROUND_ROBIN_SINGLE' as any), 1, 1);
    const fixtures = pairings.map((pairing, index) => {
      const [first, second] = [pairing.homePlayerId, pairing.awayPlayerId].sort();
      return {
        id: `fixture-${index + 1}`,
        schedule_key: `${first}:${second}:${pairing.leg}`,
        fixture_number: index + 1,
        scheduling_period_number: 1,
        concurrency_slot: index + 1,
        match_week: { week_number: pairing.round },
        home_player_id: pairing.homePlayerId,
        away_player_id: pairing.awayPlayerId,
        match: { id: `match-${index + 1}` },
      };
    });

    const validation = validateGeneratedSchedule(
      pairings,
      fixtures,
      playerIds,
      'ROUND_ROBIN_SINGLE' as any,
      1,
      1,
    );

    expect(validation.valid).toBe(true);
    expect(validation.totalFixtures).toBe(6);
    expect(validation.fixturesPerParticipant.every(({ fixtureCount }) => fixtureCount === 3)).toBe(true);
    expect(validation.fixturesPerSchedulingPeriod).toEqual([{ periodNumber: 1, fixtureCount: 6 }]);
    expect(validation.maximumFixturesPerParticipantPerPeriod).toBe(3);
    expect(validation.requiredConcurrentMatches).toBe(1);
    expect(validation.schedulingPeriodsRequired).toBe(1);
    expect(validation.densityWarnings).toHaveLength(1);
    expect(validation.errors).toHaveLength(0);
  });

  it('rejects invalid pairings and concurrency while retaining density as a warning-only rule', () => {
    const playerIds = ['A', 'B', 'C', 'D'];
    const pairings = distributeFixtures(buildRoundRobin(playerIds, 'ROUND_ROBIN_SINGLE' as any), 1, 2);
    const fixtures = pairings.map((pairing, index) => {
      const [first, second] = [pairing.homePlayerId, pairing.awayPlayerId].sort();
      return {
        id: `fixture-${index + 1}`,
        schedule_key: `${first}:${second}:${pairing.leg}`,
        fixture_number: index + 1,
        scheduling_period_number: 1,
        concurrency_slot: 1,
        match_week: { week_number: pairing.round },
        home_player_id: pairing.homePlayerId,
        away_player_id: pairing.awayPlayerId,
        match: { id: `match-${index + 1}` },
      };
    });
    fixtures[0].away_player_id = 'outside-field';

    const validation = validateGeneratedSchedule(
      pairings,
      fixtures,
      playerIds,
      'ROUND_ROBIN_SINGLE' as any,
      1,
      2,
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.includes('outside the selected competition field'))).toBe(true);
    expect(validation.errors.some((error) => error.includes('exceeding the configured capacity'))).toBe(true);
  });
});

describe('FixtureService.generateDivisionSchedule', () => {
  const participants = [
    { player_id: 'player-a', seed: 1, registered_at: new Date('2026-01-01T00:00:00Z') },
    { player_id: 'player-b', seed: 2, registered_at: new Date('2026-01-02T00:00:00Z') },
    { player_id: 'player-c', seed: 3, registered_at: new Date('2026-01-03T00:00:00Z') },
    { player_id: 'player-d', seed: 4, registered_at: new Date('2026-01-04T00:00:00Z') },
  ];

  it('rejects a 2,000-player double round robin before fixture generation begins', async () => {
    const largeRegistrationPool = Array.from({ length: 2000 }, (_, index) => ({
      player_id: `player-${String(index + 1).padStart(4, '0')}`,
      seed: null,
      registered_at: new Date('2026-01-01T00:00:00Z'),
    }));
    const tx: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      division: { findUnique: vi.fn().mockResolvedValue({
        id: 'division-id',
        season_id: 'season-id',
        name: 'Division 1',
        active: true,
        format: 'ROUND_ROBIN_DOUBLE',
        capacity: null,
        competition_participant_count: null,
        matches_per_participant: 1,
        concurrent_matches: 1,
      }) },
      divisionParticipant: {
        findMany: vi.fn().mockResolvedValue(largeRegistrationPool),
        updateMany: vi.fn(),
      },
      fixture: { count: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    };
    const service = new FixtureService(
      { $transaction: (callback: any) => callback(tx) } as any,
      {} as any,
    );

    await expect(service.generateDivisionSchedule('season-id', 'division-id')).rejects.toThrow(
      `requires 3998000 fixtures`,
    );
    expect(tx.divisionParticipant.updateMany).not.toHaveBeenCalled();
    expect(tx.fixture.count).not.toHaveBeenCalled();
    expect(tx.fixture.findMany).not.toHaveBeenCalled();
    expect(tx.fixture.create).not.toHaveBeenCalled();
    expect(MAX_FIXTURES_PER_GENERATION).toBe(10000);
  });

  it('reports impractical requested fields without loading fixture rows', async () => {
    const largeRegistrationPool = Array.from({ length: 2000 }, (_, index) => ({
      player_id: `player-${String(index + 1).padStart(4, '0')}`,
      seed: null,
      registered_at: new Date('2026-01-01T00:00:00Z'),
    }));
    const prisma: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      division: { findUnique: vi.fn().mockResolvedValue({
        id: 'division-id',
        season_id: 'season-id',
        name: 'Division 1',
        active: true,
        format: 'ROUND_ROBIN_DOUBLE',
        capacity: null,
        registration_capacity: 2000,
        competition_participant_count: null,
        scheduling_period_days: 7,
        matches_per_participant: 1,
        match_window_start_minutes: null,
        match_window_end_minutes: null,
        match_window_timezone: 'UTC',
        concurrent_matches: 1,
      }) },
      divisionParticipant: {
        findMany: vi.fn().mockResolvedValue(largeRegistrationPool),
        count: vi.fn().mockResolvedValue(2000),
      },
      fixture: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn() },
    };
    const service = new FixtureService(prisma, {} as any);

    const status = await service.getDivisionScheduleStatus('season-id', 'division-id');

    expect(status).toMatchObject({
      registrationCount: 2000,
      participantCount: 2000,
      expectedFixtureCount: 3998000,
      currentFixtureCount: 0,
      generationStatus: 'BLOCKED',
    });
    expect(status.blockers.some((blocker) => blocker.includes('per-transaction generation limit'))).toBe(true);
    expect(prisma.fixture.findMany).not.toHaveBeenCalled();
  });

  it('supports 2,000 registrations with an explicitly bounded 64-player double-round-robin field', async () => {
    const registrations = Array.from({ length: 2000 }, (_, index) => ({
      player_id: `player-${String(index + 1).padStart(4, '0')}`,
      seed: null,
      registered_at: new Date('2026-01-01T00:00:00Z'),
    }));
    const prisma: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      division: { findUnique: vi.fn().mockResolvedValue({
        id: 'division-id',
        season_id: 'season-id',
        name: 'Division 1',
        active: true,
        format: 'ROUND_ROBIN_DOUBLE',
        capacity: 64,
        registration_capacity: 2000,
        competition_participant_count: 64,
        scheduling_period_days: 7,
        matches_per_participant: 3,
        match_window_start_minutes: null,
        match_window_end_minutes: null,
        match_window_timezone: 'UTC',
        concurrent_matches: 1,
      }) },
      divisionParticipant: {
        findMany: vi.fn().mockResolvedValue(registrations),
        count: vi.fn().mockResolvedValue(2000),
      },
      fixture: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn() },
    };
    const service = new FixtureService(prisma, {} as any);

    const status = await service.getDivisionScheduleStatus('season-id', 'division-id');

    expect(status).toMatchObject({
      registrationCount: 2000,
      participantCount: 64,
      expectedFixtureCount: 4032,
      generationStatus: 'NOT_GENERATED',
    });
    expect(status.blockers).toHaveLength(0);
    expect(prisma.fixture.findMany).not.toHaveBeenCalled();
  });

  it('persists a numbered, round-assigned single round robin transactionally', async () => {
    const createdFixtures: any[] = [];
    const tx: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      division: { findUnique: vi.fn().mockResolvedValue({ id: 'division-id', season_id: 'season-id', name: 'Division 1', active: true, format: 'ROUND_ROBIN_SINGLE', matches_per_participant: 1, concurrent_matches: 1 }) },
      divisionParticipant: { findMany: vi.fn().mockResolvedValue(participants), updateMany: vi.fn() },
      fixture: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(async ({ data }) => { createdFixtures.push(data); return { id: `fixture-${data.fixture_number}` }; }),
      },
      matchWeek: {
        upsert: vi.fn(async ({ create }) => ({ id: `week-${create.week_number}`, week_number: create.week_number })),
        findMany: vi.fn(async () => Array.from({ length: 3 }, (_, index) => ({ id: `week-${index + 1}`, week_number: index + 1 }))),
      },
      match: { create: vi.fn(async ({ data }) => ({ id: `match-${data.fixture_id}` })) },
      matchParticipant: { createMany: vi.fn() },
    };
    const prisma: any = {
      $transaction: vi.fn(async (callback, options) => {
        expect(options).toEqual({ isolationLevel: 'Serializable' });
        return callback(tx);
      }),
    };
    const outbox = { enqueueEvent: vi.fn() };
    const service = new FixtureService(prisma, outbox as any);

    const result = await service.generateDivisionSchedule('season-id', 'division-id', { id: 'admin-id' });

    expect(result).toMatchObject({ status: 'GENERATED', participantCount: 4, roundCount: 3, schedulingPeriodCount: 3, expectedFixtureCount: 6, fixtureCount: 6 });
    expect(createdFixtures.map(({ scheduling_period_number }) => scheduling_period_number)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(createdFixtures.map(({ fixture_number }) => fixture_number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(createdFixtures.every(({ status }) => status === 'SCHEDULED')).toBe(true);
    expect(tx.match.create).toHaveBeenCalledTimes(6);
    expect(tx.matchParticipant.createMany).toHaveBeenCalledTimes(6);
    expect(outbox.enqueueEvent).toHaveBeenCalledWith(tx, expect.objectContaining({ eventName: 'division.fixtures_generated' }));
  });

  it('selects only the configured field in deterministic seed order and clears all other selection markers', async () => {
    const seededFirst = { player_id: 'seeded-first', seed: 1, registered_at: new Date('2026-01-04T00:00:00Z') };
    const seededSecond = { player_id: 'seeded-second', seed: 2, registered_at: new Date('2026-01-03T00:00:00Z') };
    const unseededFirst = { player_id: 'unseeded-first', seed: null, registered_at: new Date('2026-01-01T00:00:00Z') };
    const unseededSecond = { player_id: 'unseeded-second', seed: null, registered_at: new Date('2026-01-02T00:00:00Z') };
    const allRegistrations = [unseededFirst, seededSecond, unseededSecond, seededFirst];
    const createdFixtures: any[] = [];
    const tx: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      division: { findUnique: vi.fn().mockResolvedValue({
        id: 'division-id',
        season_id: 'season-id',
        name: 'Division 1',
        active: true,
        format: 'ROUND_ROBIN_SINGLE',
        capacity: 64,
        competition_participant_count: 2,
        matches_per_participant: 1,
        concurrent_matches: 1,
      }) },
      divisionParticipant: {
        findMany: vi.fn().mockResolvedValue(allRegistrations),
        updateMany: vi.fn(),
      },
      fixture: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(async ({ data }) => { createdFixtures.push(data); return { id: 'fixture-1' }; }),
      },
      matchWeek: {
        upsert: vi.fn(async ({ create }) => ({ id: 'week-1', week_number: create.week_number })),
        findMany: vi.fn().mockResolvedValue([{ id: 'week-1', week_number: 1 }]),
      },
      match: { create: vi.fn().mockResolvedValue({ id: 'match-1' }) },
      matchParticipant: { createMany: vi.fn() },
    };
    const service = new FixtureService(
      { $transaction: (callback: any) => callback(tx) } as any,
      { enqueueEvent: vi.fn() } as any,
    );

    const result = await service.generateDivisionSchedule('season-id', 'division-id');

    expect(result).toMatchObject({ participantCount: 2, expectedFixtureCount: 1, fixtureCount: 1 });
    expect(createdFixtures).toHaveLength(1);
    expect(new Set([createdFixtures[0].home_player_id, createdFixtures[0].away_player_id])).toEqual(
      new Set(['seeded-first', 'seeded-second']),
    );
    expect(tx.divisionParticipant.updateMany).toHaveBeenNthCalledWith(1, {
      where: { season_id: 'season-id', division_id: 'division-id' },
      data: { competition_selected: false },
    });
    expect(tx.divisionParticipant.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        season_id: 'season-id',
        division_id: 'division-id',
        player_id: { in: ['seeded-first', 'seeded-second'] },
      },
      data: { competition_selected: true },
    });
  });

  it('reports all registrations separately from the resolved competition field', async () => {
    const prisma: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      division: { findUnique: vi.fn().mockResolvedValue({
        id: 'division-id',
        season_id: 'season-id',
        name: 'Division 1',
        active: true,
        format: 'ROUND_ROBIN_SINGLE',
        capacity: 64,
        competition_participant_count: 2,
        registration_capacity: 2000,
        scheduling_period_days: 7,
        matches_per_participant: 1,
        match_window_start_minutes: null,
        match_window_end_minutes: null,
        match_window_timezone: 'UTC',
        concurrent_matches: 1,
      }) },
      divisionParticipant: {
        findMany: vi.fn().mockResolvedValue(participants),
        count: vi.fn().mockResolvedValue(1850),
      },
      fixture: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn() },
    };
    const service = new FixtureService(prisma, {} as any);

    const status = await service.getDivisionScheduleStatus('season-id', 'division-id');

    expect(status).toMatchObject({ registrationCount: 1850, participantCount: 2, expectedFixtureCount: 1 });
  });

  it('rejects generation until the season roster is locked', async () => {
    const tx: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'REGISTRATION_OPEN' }) },
    };
    const service = new FixtureService({ $transaction: (callback: any) => callback(tx) } as any, {} as any);

    await expect(service.generateDivisionSchedule('season-id', 'division-id')).rejects.toThrow(
      'Fixtures can only be generated when the season is ROSTER_LOCKED (current status: REGISTRATION_OPEN)',
    );
  });

  it('returns ALREADY_GENERATED only for the complete matching schedule', async () => {
    const pairings = buildRoundRobin(participants.map(({ player_id }) => player_id), 'ROUND_ROBIN_SINGLE' as any);
    const distributedPairings = distributeFixtures(pairings, 1, 1);
    const fixtures = distributedPairings.map((pairing, index) => {
      const [first, second] = [pairing.homePlayerId, pairing.awayPlayerId].sort();
      return {
        id: `fixture-${index + 1}`,
        schedule_key: `${first}:${second}:${pairing.leg}`,
        fixture_number: index + 1,
        scheduling_period_number: pairing.schedulingPeriod,
        concurrency_slot: pairing.concurrencySlot,
        match_week: { week_number: pairing.round },
        home_player_id: pairing.homePlayerId,
        away_player_id: pairing.awayPlayerId,
        match: { id: `match-${index + 1}` },
      };
    });
    const tx: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      division: { findUnique: vi.fn().mockResolvedValue({ id: 'division-id', season_id: 'season-id', name: 'Division 1', active: true, format: 'ROUND_ROBIN_SINGLE', matches_per_participant: 1, concurrent_matches: 1 }) },
      divisionParticipant: { findMany: vi.fn().mockResolvedValue(participants), updateMany: vi.fn() },
      fixture: { count: vi.fn().mockResolvedValue(fixtures.length), findMany: vi.fn().mockResolvedValue(fixtures) },
    };
    const service = new FixtureService({ $transaction: (callback: any) => callback(tx) } as any, {} as any);

    const result = await service.generateDivisionSchedule('season-id', 'division-id');

    expect(result).toMatchObject({ status: 'ALREADY_GENERATED', fixtureCount: 6, expectedFixtureCount: 6 });
  });

  it('does not treat a partial generated schedule as complete', async () => {
  const tx: any = {
    season: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'season-id',
        status: 'ROSTER_LOCKED',
      }),
    },
    division: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'division-id',
        season_id: 'season-id',
        name: 'Division 1',
        active: true,
        format: 'ROUND_ROBIN_SINGLE',
        matches_per_participant: 1,
        concurrent_matches: 1,
      }),
    },
    divisionParticipant: {
      findMany: vi.fn().mockResolvedValue(participants),
      updateMany: vi.fn(),
    },
    fixture: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'fixture-1',
          schedule_key: 'player-a:player-b:1',
          fixture_number: 1,
          scheduling_period_number: 1,
          concurrency_slot: 1,
          match_week: { week_number: 1 },
          home_player_id: 'player-a',
          away_player_id: 'player-b',
          match: { id: 'match-1' },
        },
      ]),
    },
  };

  const service = new FixtureService(
    { $transaction: (callback: any) => callback(tx) } as any,
    {} as any,
  );

  await expect(
    service.generateDivisionSchedule('season-id', 'division-id'),
  ).rejects.toThrow('Existing fixtures failed schedule validation');
});

function fixtureAppointment(hoursFromNow = 48) {
  const appointment = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  appointment.setUTCSeconds(0, 0);
  const at = (offsetMinutes: number) => new Date(appointment.getTime() + offsetMinutes * 60_000).toISOString();
  return {
    scheduledAt: appointment.toISOString(),
    timezone: 'UTC',
    checkInOpensAt: at(-120),
    checkInClosesAt: at(-60),
    playWindowOpensAt: at(-30),
    playWindowClosesAt: at(120),
  };
}

function createScheduleFixtureService(options: {
  fixture?: Record<string, any>;
  overlappingFixtures?: Array<Record<string, any>>;
  timezone?: string;
  matchWindowStartMinutes?: number | null;
  matchWindowEndMinutes?: number | null;
} = {}) {
  const fixture = {
    id: 'fixture-id',
    scheduled_at: null,
    scheduled_timezone: null,
    check_in_opens_at: null,
    check_in_closes_at: null,
    play_window_opens_at: null,
    play_window_closes_at: null,
    home_player_id: 'home-player',
    away_player_id: 'away-player',
    match_week: { id: 'week-id', week_number: 1, start_date: null, end_date: null },
    match: { id: 'match-id', status: 'SCHEDULED' },
    ...options.fixture,
  };
  const tx: any = {
    season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
    division: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'division-id',
        season_id: 'season-id',
        schedule_locked: false,
        concurrent_matches: 1,
        match_window_start_minutes: options.matchWindowStartMinutes ?? null,
        match_window_end_minutes: options.matchWindowEndMinutes ?? null,
        match_window_timezone: options.timezone ?? 'UTC',
      }),
    },
    fixture: {
      findFirst: vi.fn().mockResolvedValue(fixture),
      findMany: vi.fn().mockResolvedValue(options.overlappingFixtures ?? []),
      update: vi.fn(async ({ data }) => ({ ...fixture, ...data })),
    },
  };
  const outbox = { enqueueEvent: vi.fn() };
  const prisma = { $transaction: vi.fn(async (callback: any) => callback(tx)) };
  return { service: new FixtureService(prisma as any, outbox as any), tx, outbox, fixture };
}

describe('FixtureService.scheduleFixture', () => {
  it('persists an appointment timezone and explicit check-in/play windows', async () => {
    const appointment = fixtureAppointment();
    const { service, tx, outbox } = createScheduleFixtureService();

    await service.scheduleFixture('season-id', 'division-id', 'fixture-id', appointment, { id: 'operator-id' });

    expect(tx.fixture.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'fixture-id' },
      data: expect.objectContaining({
        scheduled_at: new Date(appointment.scheduledAt),
        scheduled_timezone: 'UTC',
        check_in_opens_at: new Date(appointment.checkInOpensAt),
        check_in_closes_at: new Date(appointment.checkInClosesAt),
        play_window_opens_at: new Date(appointment.playWindowOpensAt),
        play_window_closes_at: new Date(appointment.playWindowClosesAt),
        scheduling_status: 'SCHEDULED',
      }),
    }));
    expect(outbox.enqueueEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventName: 'fixture.scheduled',
      actorId: 'operator-id',
      metadata: expect.objectContaining({ before: expect.any(Object), after: expect.any(Object) }),
    }));
  });

  it('marks rescheduling explicitly and preserves the previous appointment in its event', async () => {
    const previous = fixtureAppointment();
    const next = fixtureAppointment(72);
    const priorAt = new Date(previous.scheduledAt);
    const { service, tx, outbox } = createScheduleFixtureService({
      fixture: {
        scheduled_at: priorAt,
        scheduled_timezone: previous.timezone,
        check_in_opens_at: new Date(previous.checkInOpensAt),
        check_in_closes_at: new Date(previous.checkInClosesAt),
        play_window_opens_at: new Date(previous.playWindowOpensAt),
        play_window_closes_at: new Date(previous.playWindowClosesAt),
        scheduling_status: 'SCHEDULED',
      },
    });

    await service.scheduleFixture('season-id', 'division-id', 'fixture-id', next);

    expect(tx.fixture.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ scheduling_status: 'RESCHEDULED' }),
    }));
    expect(outbox.enqueueEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventName: 'fixture.rescheduled',
      metadata: expect.objectContaining({ before: expect.objectContaining({ scheduledAt: priorAt }) }),
    }));
  });

  it('rejects timezone-less instants, invalid timezones, and windows in the past', async () => {
    const { service, tx } = createScheduleFixtureService();
    const valid = fixtureAppointment();

    await expect(service.scheduleFixture('season-id', 'division-id', 'fixture-id', {
      ...valid,
      scheduledAt: valid.scheduledAt.slice(0, -1),
    })).rejects.toThrow('explicit timezone offset');
    await expect(service.scheduleFixture('season-id', 'division-id', 'fixture-id', {
      ...valid,
      timezone: 'Not/A_Timezone',
    })).rejects.toThrow('not a valid IANA timezone');
    await expect(service.scheduleFixture('season-id', 'division-id', 'fixture-id', {
      ...valid,
      checkInOpensAt: new Date(Date.now() - 60_000).toISOString(),
    })).rejects.toThrow('in the past');
    expect(tx.fixture.update).not.toHaveBeenCalled();
  });

  it('rejects invalid window ordering and round-window overflow', async () => {
    const valid = fixtureAppointment();
    const invalidOrder = createScheduleFixtureService();
    await expect(invalidOrder.service.scheduleFixture('season-id', 'division-id', 'fixture-id', {
      ...valid,
      checkInClosesAt: valid.playWindowClosesAt,
    })).rejects.toThrow('Scheduling windows must follow');

    const outsideRound = createScheduleFixtureService({
      fixture: {
        match_week: {
          id: 'week-id',
          week_number: 1,
          start_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          end_date: null,
        },
      },
    });
    await expect(outsideRound.service.scheduleFixture('season-id', 'division-id', 'fixture-id', valid))
      .rejects.toThrow('before the configured round window');
  });

  it('rejects overlapping participant appointments and respects concurrent match capacity', async () => {
    const appointment = fixtureAppointment();
    const { service: playerConflict } = createScheduleFixtureService({
      overlappingFixtures: [{ id: 'other-fixture', home_player_id: 'home-player', away_player_id: 'third-player' }],
    });
    await expect(playerConflict.scheduleFixture('season-id', 'division-id', 'fixture-id', appointment))
      .rejects.toThrow('participant already has a fixture scheduled');

    const { service: capacityConflict } = createScheduleFixtureService({
      overlappingFixtures: [{ id: 'other-fixture', home_player_id: 'third-player', away_player_id: 'fourth-player' }],
    });
    await expect(capacityConflict.scheduleFixture('season-id', 'division-id', 'fixture-id', appointment))
      .rejects.toThrow('configured concurrency capacity');
  });

  it('prevents scheduling after match execution starts or after schedule lock', async () => {
    const appointment = fixtureAppointment();
    const started = createScheduleFixtureService({ fixture: { match: { id: 'match-id', status: 'IN_PROGRESS' } } });
    await expect(started.service.scheduleFixture('season-id', 'division-id', 'fixture-id', appointment))
      .rejects.toThrow('after match execution begins');

    const locked = createScheduleFixtureService();
    locked.tx.division.findFirst.mockResolvedValue({ id: 'division-id', schedule_locked: true });
    await expect(locked.service.scheduleFixture('season-id', 'division-id', 'fixture-id', appointment))
      .rejects.toThrow('schedule is locked');
  });
});
});
