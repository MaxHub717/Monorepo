import { describe, expect, it, vi } from 'vitest';
import { FixtureService, buildRoundRobin, distributeFixtures, ensureMatchWeeks, validateGeneratedSchedule } from './fixture.service.js';
import { SeasonService } from '../season/season.service.js';
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

  describe('ADM-014F two-player schedule lifecycle', () => {
    it('generates, validates, locks, and activates without manual appointment input', async () => {
      const season: any = {
        id: 'season-1',
        name: '2026 Season 1',
        status: 'ROSTER_LOCKED',
        start_date: new Date('2026-10-07T00:00:00.000Z'),
        end_date: new Date('2026-12-31T23:59:59.999Z'),
      };
      const division: any = {
        id: 'division-1',
        season_id: season.id,
        name: 'Division 1',
        active: true,
        format: 'ROUND_ROBIN_SINGLE',
        capacity: 2,
        competition_participant_count: 2,
        matches_per_participant: 1,
        scheduling_period_days: 7,
        concurrent_matches: 1,
        match_window_timezone: 'UTC',
        match_window_start_minutes: null,
        match_window_end_minutes: null,
        schedule_validation_required: true,
        schedule_locked: false,
      };
      const participants = [
        { player_id: 'player-a', seed: 1, registered_at: new Date('2029-01-01T00:00:00.000Z'), competition_selected: true },
        { player_id: 'player-b', seed: 2, registered_at: new Date('2029-01-02T00:00:00.000Z'), competition_selected: true },
      ];
      const pairing = buildRoundRobin(['player-a', 'player-b'], 'ROUND_ROBIN_SINGLE' as any)[0];
      const fixture: any = {
        id: 'fixture-1',
        division_id: division.id,
        schedule_key: `${[pairing.homePlayerId, pairing.awayPlayerId].sort().join(':')}:${pairing.leg}`,
        fixture_number: 1,
        scheduling_period_number: 1,
        concurrency_slot: 1,
        scheduled_at: null,
        scheduled_timezone: null,
        scheduling_status: 'UNSCHEDULED',
        check_in_opens_at: null,
        check_in_closes_at: null,
        play_window_opens_at: null,
        play_window_closes_at: null,
        match_week: { id: 'week-1', week_number: 1, start_date: null, end_date: null },
        home_player_id: pairing.homePlayerId,
        away_player_id: pairing.awayPlayerId,
        match: { id: 'match-1', status: 'SCHEDULED' },
      };
      const tx: any = {
        season: {
          findUnique: vi.fn(async () => season),
          update: vi.fn(async ({ data }) => Object.assign(season, data)),
        },
        division: {
          findFirst: vi.fn(async () => division),
          findMany: vi.fn(async () => [{ ...division }]),
          update: vi.fn(async ({ data }) => Object.assign(division, data)),
        },
        divisionParticipant: { findMany: vi.fn(async () => participants) },
        fixture: {
          findMany: vi.fn(async () => [fixture]),
          update: vi.fn(async ({ data }) => Object.assign(fixture, data)),
          count: vi.fn(({ where }: any) => Promise.resolve(where.OR ? 0 : 1)),
        },
        outboxEvent: { create: vi.fn() },
      };
      const prisma: any = { $transaction: vi.fn(async (callback: any) => callback(tx)) };
      const outbox = { enqueueEvent: vi.fn(async (_tx: any, _event: any) => undefined) };
      const fixtureService = new FixtureService(prisma, outbox as any);
      const seasonService = new SeasonService(
        prisma,
        outbox as any,
        { writeLog: vi.fn(async () => undefined) } as any,
        fixtureService,
      );

      const generated = await fixtureService.generateDivisionScheduleAppointments(season.id, division.id);
      expect(generated).toMatchObject({
        fixtureCount: 1,
        scheduledCount: 1,
        unscheduledCount: 0,
        schedulingStatus: 'GENERATED',
      });
      expect(fixture.scheduled_at).toBeInstanceOf(Date);
      expect(fixture.scheduled_timezone).toBe('UTC');
      expect(fixture.check_in_opens_at).toBeInstanceOf(Date);
      expect(fixture.check_in_closes_at).toBeInstanceOf(Date);
      expect(fixture.play_window_opens_at).toBeInstanceOf(Date);
      expect(fixture.play_window_closes_at).toBeInstanceOf(Date);

      const validation = await fixtureService.validateDivisionSchedule(season.id, division.id);
      expect(validation).toMatchObject({
        valid: true,
        summary: { fixtures: 1, scheduled: 1, errors: 0, conflicts: 0 },
      });
      await expect(fixtureService.lockDivisionSchedule(season.id, division.id))
        .resolves.toMatchObject({ scheduleLocked: true, fixtureCount: 1 });

      const activated = await seasonService.activateSeason(season.id);
      expect(activated.status).toBe('ACTIVE');
      expect(outbox.enqueueEvent.mock.calls.map(([, event]) => event.eventName)).toEqual([
        'SCHEDULE_GENERATED',
        'SCHEDULE_VALIDATED',
        'SCHEDULE_LOCKED',
        'SCHEDULE_VALIDATED',
        'season.active',
      ]);
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
  seasonStart?: Date | null;
  seasonEnd?: Date | null;
} = {}) {
  const originalAppointment = fixtureAppointment();
  const fixture = {
    id: 'fixture-id',
    scheduled_at: new Date(originalAppointment.scheduledAt),
    scheduled_timezone: originalAppointment.timezone,
    scheduling_status: 'SCHEDULED',
    check_in_opens_at: new Date(originalAppointment.checkInOpensAt),
    check_in_closes_at: new Date(originalAppointment.checkInClosesAt),
    play_window_opens_at: new Date(originalAppointment.playWindowOpensAt),
    play_window_closes_at: new Date(originalAppointment.playWindowClosesAt),
    home_player_id: 'home-player',
    away_player_id: 'away-player',
    match_week: { id: 'week-id', week_number: 1, start_date: null, end_date: null },
    match: { id: 'match-id', status: 'SCHEDULED' },
    ...options.fixture,
  };
  const tx: any = {
    season: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'season-id',
        status: 'ROSTER_LOCKED',
        start_date: options.seasonStart,
        end_date: options.seasonEnd,
      }),
    },
    division: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'division-id',
        season_id: 'season-id',
        schedule_locked: false,
        schedule_validation_required: false,
        matches_per_participant: 1,
        concurrent_matches: 1,
        match_window_start_minutes: options.matchWindowStartMinutes ?? null,
        match_window_end_minutes: options.matchWindowEndMinutes ?? null,
        match_window_timezone: options.timezone ?? 'UTC',
      }),
    },
    fixture: {
      findFirst: vi.fn().mockResolvedValue(fixture),
      findMany: vi.fn().mockResolvedValue([fixture, ...(options.overlappingFixtures ?? [])].map((other) => ({
        scheduled_at: fixture.scheduled_at,
        scheduled_timezone: 'UTC',
        scheduling_status: 'SCHEDULED',
        check_in_opens_at: fixture.check_in_opens_at,
        check_in_closes_at: fixture.check_in_closes_at,
        play_window_opens_at: fixture.play_window_opens_at,
        play_window_closes_at: fixture.play_window_closes_at,
        match_week: { week_number: 1, start_date: null, end_date: null },
        ...other,
      }))),
      update: vi.fn(async ({ data }) => ({ ...fixture, ...data })),
    },
    divisionUpdate: vi.fn(),
  };
  tx.division.update = tx.divisionUpdate;
  const outbox = { enqueueEvent: vi.fn() };
  const prisma = { $transaction: vi.fn(async (callback: any) => callback(tx)) };
  return { service: new FixtureService(prisma as any, outbox as any), tx, outbox, fixture };
}

describe('FixtureService.scheduleFixture', () => {
  it('adjusts a generated appointment and persists its timezone and explicit windows', async () => {
    const appointment = fixtureAppointment(72);
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
        scheduling_status: 'RESCHEDULED',
      }),
    }));
    expect(outbox.enqueueEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventName: 'SCHEDULE_MODIFIED',
      actorId: 'operator-id',
      metadata: expect.objectContaining({
        requiresValidation: true,
        changedAt: expect.any(String),
        before: expect.any(Object),
        after: expect.any(Object),
      }),
    }));
    expect(tx.division.update).toHaveBeenCalledWith({
      where: { id: 'division-id' },
      data: { schedule_validation_required: true },
    });

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
      eventName: 'SCHEDULE_MODIFIED',
      metadata: expect.objectContaining({ before: expect.objectContaining({ scheduledAt: priorAt }) }),
    }));
  });

  it('allows a valid timezone adjustment and records the supplied reason', async () => {
    const appointment = { ...fixtureAppointment(72), timezone: 'America/New_York', reason: 'Venue changed' };
    const { service, outbox, tx } = createScheduleFixtureService();

    await service.scheduleFixture('season-id', 'division-id', 'fixture-id', appointment, {
      id: 'operator-id',
      role: 'OPERATOR',
      correlationId: 'request-2',
    });

    expect(tx.fixture.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ scheduled_timezone: 'America/New_York' }),
    }));
    expect(outbox.enqueueEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventName: 'SCHEDULE_MODIFIED',
      reason: 'Venue changed',
      correlationId: 'request-2',
    }));
  });

  it('does not use adjustment to manually schedule a fixture without a generated appointment', async () => {
    const { service, tx } = createScheduleFixtureService({
      fixture: {
        scheduled_at: null,
        scheduled_timezone: null,
        scheduling_status: 'UNSCHEDULED',
        check_in_opens_at: null,
        check_in_closes_at: null,
        play_window_opens_at: null,
        play_window_closes_at: null,
      },
    });

    await expect(service.scheduleFixture(
      'season-id',
      'division-id',
      'fixture-id',
      fixtureAppointment(),
    )).rejects.toThrow('existing generated appointment');
    expect(tx.fixture.update).not.toHaveBeenCalled();
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
    })).rejects.toThrow('invalid IANA timezone');
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
    })).rejects.toThrow('invalid appointment-window ordering');

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
    await expect(outsideRound.service.scheduleFixture(
      'season-id',
      'division-id',
      'fixture-id',
      fixtureAppointment(72),
    )).rejects.toThrow('round 1 opens');
  });

  it('rejects adjustments outside the season date scope', async () => {
    const { service, tx } = createScheduleFixtureService({
      seasonStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
      seasonEnd: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    await expect(service.scheduleFixture(
      'season-id',
      'division-id',
      'fixture-id',
      fixtureAppointment(72),
    )).rejects.toThrow('after the configured season scope');
    expect(tx.fixture.update).not.toHaveBeenCalled();
  });

  it('rejects overlapping participant appointments and respects concurrent match capacity', async () => {
    const appointment = fixtureAppointment(72);
    const start = new Date(appointment.checkInOpensAt);
    const end = new Date(appointment.playWindowClosesAt);
    const { service: playerConflict } = createScheduleFixtureService({
      overlappingFixtures: [{
        id: 'other-fixture',
        home_player_id: 'home-player',
        away_player_id: 'third-player',
        scheduled_at: new Date(appointment.scheduledAt),
        check_in_opens_at: start,
        check_in_closes_at: new Date(start.getTime() + 30 * 60_000),
        play_window_opens_at: new Date(start.getTime() + 45 * 60_000),
        play_window_closes_at: end,
      }],
    });
    await expect(playerConflict.scheduleFixture('season-id', 'division-id', 'fixture-id', appointment))
      .rejects.toThrow('overlapping operational windows');

    const { service: capacityConflict } = createScheduleFixtureService({
      overlappingFixtures: [{
        id: 'other-fixture',
        home_player_id: 'third-player',
        away_player_id: 'fourth-player',
        scheduled_at: new Date(appointment.scheduledAt),
        check_in_opens_at: start,
        check_in_closes_at: new Date(start.getTime() + 30 * 60_000),
        play_window_opens_at: new Date(start.getTime() + 45 * 60_000),
        play_window_closes_at: end,
      }],
    });
    await expect(capacityConflict.scheduleFixture('season-id', 'division-id', 'fixture-id', appointment))
      .rejects.toThrow('Configured concurrency limit');
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

function createScheduleGenerationService(options: {
  seasonStatus?: string;
  division?: Record<string, unknown>;
  fixtures?: Array<Record<string, any>>;
  participantIds?: string[];
} = {}) {
  const participantIds = options.participantIds ?? ['player-a', 'player-b'];
  const pairings = distributeFixtures(
    buildRoundRobin(participantIds, 'ROUND_ROBIN_SINGLE' as any),
    1,
    1,
  );
  const fixtures = options.fixtures ?? pairings.map((pairing, index) => {
    const [first, second] = [pairing.homePlayerId, pairing.awayPlayerId].sort();
    return {
      id: `fixture-${index + 1}`,
      schedule_key: `${first}:${second}:${pairing.leg}`,
      fixture_number: index + 1,
      scheduling_period_number: pairing.schedulingPeriod,
      concurrency_slot: pairing.concurrencySlot,
      scheduled_at: null,
      scheduled_timezone: null,
      scheduling_status: 'UNSCHEDULED',
      check_in_opens_at: null,
      check_in_closes_at: null,
      play_window_opens_at: null,
      play_window_closes_at: null,
      match_week: { id: `week-${pairing.round}`, week_number: pairing.round, start_date: null, end_date: null },
      home_player_id: pairing.homePlayerId,
      away_player_id: pairing.awayPlayerId,
      match: { id: `match-${index + 1}`, status: 'SCHEDULED' },
    };
  });
  const division = {
    id: 'division-id',
    season_id: 'season-id',
    name: 'Division 1',
    active: true,
    format: 'ROUND_ROBIN_SINGLE',
    capacity: null,
    competition_participant_count: null,
    matches_per_participant: 1,
    scheduling_period_days: 7,
    concurrent_matches: 1,
    match_window_timezone: 'UTC',
    match_window_start_minutes: null,
    match_window_end_minutes: null,
    ...options.division,
  };
  const tx: any = {
    season: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'season-id',
        status: options.seasonStatus ?? 'ROSTER_LOCKED',
        start_date: new Date('2030-01-01T00:00:00.000Z'),
        end_date: new Date('2031-01-01T00:00:00.000Z'),
      }),
    },
    division: {
      findFirst: vi.fn().mockResolvedValue(division),
      update: vi.fn(),
    },
    divisionParticipant: {
      findMany: vi.fn().mockResolvedValue(participantIds.map((player_id, index) => ({
        player_id,
        seed: index + 1,
        registered_at: new Date(`2029-01-0${index + 1}T00:00:00.000Z`),
      }))),
    },
    fixture: {
      findMany: vi.fn().mockResolvedValue(fixtures),
      update: vi.fn(async ({ where, data }) => {
        const fixture = fixtures.find(({ id }) => id === where.id);
        Object.assign(fixture, data);
        return fixture;
      }),
    },
  };
  const outbox = { enqueueEvent: vi.fn() };
  const prisma = { $transaction: vi.fn(async (callback: any) => callback(tx)) };
  return { service: new FixtureService(prisma as any, outbox as any), tx, outbox, fixtures };
}

describe('FixtureService.generateDivisionScheduleAppointments', () => {
  it('persists generated appointments and returns a schedule summary with an audit event', async () => {
    const { service, tx, outbox } = createScheduleGenerationService();

    const result = await service.generateDivisionScheduleAppointments(
      'season-id',
      'division-id',
      { id: 'operator-id', role: 'OPERATOR', correlationId: 'request-1' },
    );

    expect(result).toMatchObject({
      fixtureCount: 1,
      scheduledCount: 1,
      unscheduledCount: 0,
      schedulingStatus: 'GENERATED',
      warnings: [],
    });
    expect(tx.fixture.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'fixture-1' },
      data: expect.objectContaining({
        scheduled_at: expect.any(Date),
        scheduled_timezone: 'UTC',
        check_in_opens_at: expect.any(Date),
        check_in_closes_at: expect.any(Date),
        play_window_opens_at: expect.any(Date),
        play_window_closes_at: expect.any(Date),
        scheduling_status: 'SCHEDULED',
      }),
    }));
    expect(outbox.enqueueEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventName: 'SCHEDULE_GENERATED',
      aggregateType: 'Division',
      aggregateId: 'division-id',
      actorId: 'operator-id',
      metadata: expect.objectContaining({
        seasonId: 'season-id',
        divisionId: 'division-id',
        generatedAt: expect.any(String),
        generatedFixtureCount: 1,
      }),
    }));
  });

  it('is idempotent and does not audit a second generation when every fixture is scheduled', async () => {
    const { service, outbox } = createScheduleGenerationService();

    await service.generateDivisionScheduleAppointments('season-id', 'division-id');
    const repeatedResult = await service.generateDivisionScheduleAppointments('season-id', 'division-id');

    expect(repeatedResult).toMatchObject({
      fixtureCount: 1,
      scheduledCount: 1,
      unscheduledCount: 0,
      schedulingStatus: 'ALREADY_SCHEDULED',
    });
    expect(outbox.enqueueEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects non-locked seasons, inactive divisions, incomplete fixtures, and invalid configuration', async () => {
    const unlocked = createScheduleGenerationService({ seasonStatus: 'REGISTRATION_CLOSED' });
    await expect(unlocked.service.generateDivisionScheduleAppointments('season-id', 'division-id'))
      .rejects.toThrow('requires the season to be ROSTER_LOCKED');

    const inactive = createScheduleGenerationService({ division: { active: false } });
    await expect(inactive.service.generateDivisionScheduleAppointments('season-id', 'division-id'))
      .rejects.toThrow('is inactive');

    const incomplete = createScheduleGenerationService({ fixtures: [] });
    await expect(incomplete.service.generateDivisionScheduleAppointments('season-id', 'division-id'))
      .rejects.toThrow('expected 1 fixtures but found 0');

    const invalidConfiguration = createScheduleGenerationService({
      division: { match_window_timezone: 'Invalid/Timezone' },
    });
    await expect(invalidConfiguration.service.generateDivisionScheduleAppointments('season-id', 'division-id'))
      .rejects.toThrow('not a valid IANA timezone');

    const invalidFixture = createScheduleGenerationService({
      fixtures: [{
        ...createScheduleGenerationService().fixtures[0],
        schedule_key: 'unexpected-pairing',
      }],
    });
    await expect(invalidFixture.service.generateDivisionScheduleAppointments('season-id', 'division-id'))
      .rejects.toThrow('Fixture data is invalid');
  });

  it('does not silently repair or overwrite a partial existing appointment', async () => {
    const existingFixture = {
      ...createScheduleGenerationService().fixtures[0],
      scheduled_at: new Date('2030-01-01T10:00:00.000Z'),
      scheduling_status: 'SCHEDULED',
    };
    const { service, tx } = createScheduleGenerationService({ fixtures: [existingFixture] });

    await expect(service.generateDivisionScheduleAppointments('season-id', 'division-id'))
      .rejects.toThrow('has an incomplete existing appointment');
    expect(tx.fixture.update).not.toHaveBeenCalled();
  });
});

function createScheduleValidationService(options: {
  fixtures?: Array<Record<string, any>>;
  division?: Record<string, unknown>;
  season?: Record<string, unknown>;
  participantIds?: string[];
} = {}) {
  const participantIds = options.participantIds ?? ['player-a', 'player-b', 'player-c', 'player-d'];
  const distributed = distributeFixtures(
    buildRoundRobin(participantIds, 'ROUND_ROBIN_SINGLE' as any),
    1,
    2,
  );
  const fixtures = options.fixtures ?? distributed.map((pairing, index) => {
    const [first, second] = [pairing.homePlayerId, pairing.awayPlayerId].sort();
    const scheduledAt = new Date(Date.UTC(2030, 0, 1, 6 + index * 5));
    return {
      id: `fixture-${index + 1}`,
      schedule_key: `${first}:${second}:${pairing.leg}`,
      fixture_number: index + 1,
      scheduling_period_number: pairing.schedulingPeriod,
      concurrency_slot: pairing.concurrencySlot,
      scheduled_at: scheduledAt,
      scheduled_timezone: 'UTC',
      scheduling_status: 'SCHEDULED',
      check_in_opens_at: new Date(scheduledAt.getTime() - 2 * 60 * 60 * 1000),
      check_in_closes_at: new Date(scheduledAt.getTime() - 60 * 60 * 1000),
      play_window_opens_at: new Date(scheduledAt.getTime() - 30 * 60 * 1000),
      play_window_closes_at: new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000),
      match_week: { id: `week-${pairing.round}`, week_number: pairing.round, start_date: null, end_date: null },
      home_player_id: pairing.homePlayerId,
      away_player_id: pairing.awayPlayerId,
      match: { id: `match-${index + 1}`, status: 'SCHEDULED' },
    };
  });
  const division = {
    id: 'division-id',
    name: 'Division 1',
    active: true,
    format: 'ROUND_ROBIN_SINGLE',
    capacity: null,
    competition_participant_count: null,
    matches_per_participant: 1,
    scheduling_period_days: 7,
    concurrent_matches: 2,
    match_window_timezone: 'UTC',
    match_window_start_minutes: null,
    match_window_end_minutes: null,
    schedule_validation_required: true,
    ...options.division,
  };
  const tx: any = {
    season: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'season-id',
        status: 'ROSTER_LOCKED',
        start_date: new Date('2030-01-01T00:00:00.000Z'),
        end_date: new Date('2030-01-31T23:59:59.999Z'),
        ...options.season,
      }),
    },
    division: {
      findFirst: vi.fn().mockResolvedValue(division),
      update: vi.fn(async ({ data }) => Object.assign(division, data)),
    },
    divisionParticipant: {
      findMany: vi.fn().mockResolvedValue(participantIds.map((player_id, index) => ({
        player_id,
        seed: index + 1,
        registered_at: new Date(`2029-01-0${index + 1}T00:00:00.000Z`),
      }))),
    },
    fixture: { findMany: vi.fn().mockResolvedValue(fixtures) },
  };
  const prisma: any = {
    season: tx.season,
    division: tx.division,
    divisionParticipant: tx.divisionParticipant,
    fixture: tx.fixture,
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  };
  const outbox = { enqueueEvent: vi.fn() };
  return {
    service: new FixtureService(prisma, outbox as any),
    outbox,
    tx,
    fixtures,
    prisma,
  };
}

describe('FixtureService.validateDivisionSchedule', () => {
  it('returns a repeatable valid summary without modifying schedule data', async () => {
    const { service, tx, prisma, outbox } = createScheduleValidationService();

    const firstResult = await service.validateDivisionSchedule('season-id', 'division-id');
    const secondResult = await service.validateDivisionSchedule('season-id', 'division-id');

    expect(firstResult).toMatchObject({
      valid: true,
      errors: [],
      warnings: [],
      summary: { fixtures: 6, scheduled: 6, errors: 0, warnings: 0, conflicts: 0 },
    });
    expect(secondResult).toEqual(firstResult);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.division.update).toHaveBeenCalledTimes(1);
    expect(tx.division.update).toHaveBeenCalledWith({
      where: { id: 'division-id' },
      data: { schedule_validation_required: false },
    });
    expect(tx.fixture.findMany).toHaveBeenCalledTimes(2);
    expect(outbox.enqueueEvent).toHaveBeenCalledTimes(2);
    expect(outbox.enqueueEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventName: 'SCHEDULE_VALIDATED',
      aggregateType: 'Division',
      aggregateId: 'division-id',
      metadata: expect.objectContaining({
        seasonId: 'season-id',
        divisionId: 'division-id',
        validatedAt: expect.any(String),
        valid: true,
      }),
    }));
  });

  it('reports missing appointments, invalid timezones, window ordering, and season/round scope violations', async () => {
    const { service: missingFixturesService } = createScheduleValidationService({
      fixtures: [],
      participantIds: ['player-a', 'player-b'],
    });
    const missingFixtures = await missingFixturesService.validateDivisionSchedule('season-id', 'division-id');
    expect(missingFixtures.errors.some((error) => error.includes('Expected 1 persisted fixtures; found 0'))).toBe(true);

    const { service } = createScheduleValidationService({
      fixtures: [
        {
          id: 'missing',
          fixture_number: 1,
          schedule_key: 'a:b:1',
          scheduling_period_number: 1,
          concurrency_slot: 1,
          home_player_id: 'player-a',
          away_player_id: 'player-b',
          match_week: { id: 'week-1', week_number: 1, start_date: null, end_date: null },
          match: { id: 'match-1', status: 'SCHEDULED' },
        },
      ],
      participantIds: ['player-a', 'player-b'],
    });
    const missing = await service.validateDivisionSchedule('season-id', 'division-id');
    expect(missing.errors.some((error) => error.includes('missing a scheduled time'))).toBe(true);

    const { service: invalidService } = createScheduleValidationService({
      fixtures: [{
        ...createScheduleValidationService({ participantIds: ['player-a', 'player-b'] }).fixtures[0],
        scheduled_timezone: 'Not/A_Timezone',
        check_in_opens_at: new Date('2029-12-31T20:00:00.000Z'),
        check_in_closes_at: new Date('2030-01-01T09:00:00.000Z'),
        play_window_opens_at: new Date('2030-01-01T08:00:00.000Z'),
        scheduled_at: new Date('2030-01-01T07:00:00.000Z'),
        play_window_closes_at: new Date('2030-02-01T00:00:00.000Z'),
        match_week: {
          id: 'week-1',
          week_number: 1,
          start_date: new Date('2030-01-01T00:00:00.000Z'),
          end_date: new Date('2030-01-30T00:00:00.000Z'),
        },
      }],
      participantIds: ['player-a', 'player-b'],
    });
    const invalid = await invalidService.validateDivisionSchedule('season-id', 'division-id');
    expect(invalid.errors.some((error) => error.includes('invalid IANA timezone'))).toBe(true);
    expect(invalid.errors.some((error) => error.includes('invalid appointment-window ordering'))).toBe(true);
    expect(invalid.errors.some((error) => error.includes('before the configured season scope'))).toBe(true);
    expect(invalid.errors.some((error) => error.includes('after the configured season scope'))).toBe(true);
    expect(invalid.errors.some((error) => error.includes('round 1 opens'))).toBe(true);
    expect(invalid.errors.some((error) => error.includes('round 1 closes'))).toBe(true);
  });

  it('detects fixture number, participant, duplicate assignment, participant conflict, and concurrency errors', async () => {
    const baseline = createScheduleValidationService();
    const first = baseline.fixtures[0];
    const second = {
      ...baseline.fixtures[1],
      fixture_number: first.fixture_number,
      schedule_key: first.schedule_key,
      home_player_id: first.home_player_id,
      away_player_id: first.away_player_id,
      scheduled_at: first.scheduled_at,
      check_in_opens_at: first.check_in_opens_at,
      check_in_closes_at: first.check_in_closes_at,
      play_window_opens_at: first.play_window_opens_at,
      play_window_closes_at: first.play_window_closes_at,
    };
    const invalidThird = {
      ...baseline.fixtures[2],
      home_player_id: 'outside-field',
      scheduled_at: first.scheduled_at,
      check_in_opens_at: first.check_in_opens_at,
      check_in_closes_at: first.check_in_closes_at,
      play_window_opens_at: first.play_window_opens_at,
      play_window_closes_at: first.play_window_closes_at,
    };
    const { service } = createScheduleValidationService({
      fixtures: [first, second, invalidThird, ...baseline.fixtures.slice(3)],
    });

    const result = await service.validateDivisionSchedule('season-id', 'division-id');
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('Duplicate fixture number'))).toBe(true);
    expect(result.errors.some((error) => error.includes('Duplicate fixture pairing assignment'))).toBe(true);
    expect(result.errors.some((error) => error.includes('outside the selected competition field'))).toBe(true);
    expect(result.errors.some((error) => error.includes('overlapping operational windows'))).toBe(true);
    expect(result.errors.some((error) => error.includes('Configured concurrency limit'))).toBe(true);
    expect(result.summary.conflicts).toBeGreaterThan(0);
  });

  it('keeps density excess as warnings, not blocking errors', async () => {
    const baseline = createScheduleValidationService();
    const fixtures = baseline.fixtures.map((fixture, index) => ({
      ...fixture,
      scheduling_period_number: 1,
      concurrency_slot: index + 1,
    }));
    const { service } = createScheduleValidationService({ fixtures });

    const result = await service.validateDivisionSchedule('season-id', 'division-id');

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes('scheduling period 1'))).toBe(true);
    expect(result.summary.warnings).toBeGreaterThan(0);
  });

  it('reports invalid scheduling configuration without throwing or writing data', async () => {
    const { service, prisma } = createScheduleValidationService({
      division: { concurrent_matches: 0 },
    });

    const result = await service.validateDivisionSchedule('season-id', 'division-id');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Scheduling configuration has an invalid concurrency limit.');
    expect(prisma.fixture.findMany).toHaveBeenCalledTimes(1);
  });

  it('requires explicit whole-schedule validation before locking after a change', async () => {
    const tx: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      division: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'division-id',
          active: true,
          schedule_locked: false,
          schedule_validation_required: true,
        }),
      },
    };
    const service = new FixtureService(
      { $transaction: (callback: any) => callback(tx) } as any,
      {} as any,
    );

    await expect(service.lockDivisionSchedule('season-id', 'division-id'))
      .rejects.toThrow('Validate the whole schedule after the latest change');
  });

  it('locks only a complete, valid schedule and records SCHEDULE_LOCKED', async () => {
    const baseline = createScheduleValidationService({
      division: { schedule_validation_required: false },
    });
    const division = {
      id: 'division-id',
      name: 'Division 1',
      active: true,
      format: 'ROUND_ROBIN_SINGLE',
      capacity: null,
      competition_participant_count: null,
      matches_per_participant: 1,
      scheduling_period_days: 7,
      concurrent_matches: 2,
      match_window_timezone: 'UTC',
      match_window_start_minutes: null,
      match_window_end_minutes: null,
      schedule_locked: false,
      schedule_validation_required: false,
    };
    baseline.tx.division.findFirst.mockResolvedValue(division);
    baseline.tx.division.update = vi.fn(async ({ data }: any) => Object.assign(division, data));
    baseline.tx.fixture.findMany = vi.fn().mockResolvedValue(baseline.fixtures);
    baseline.tx.fixture.update = vi.fn();
    const outbox = { enqueueEvent: vi.fn() };
    const service = new FixtureService(
      { $transaction: vi.fn(async (callback: any) => callback(baseline.tx)) } as any,
      outbox as any,
    );

    const result = await service.lockDivisionSchedule('season-id', 'division-id', {
      id: 'operator-id',
      role: 'OPERATOR',
      correlationId: 'request-3',
    });

    expect(result).toMatchObject({ scheduleLocked: true, fixtureCount: 6 });
    expect(baseline.tx.division.update).toHaveBeenCalledWith({
      where: { id: 'division-id' },
      data: { schedule_locked: true },
    });
    expect(outbox.enqueueEvent).toHaveBeenCalledWith(baseline.tx, expect.objectContaining({
      eventName: 'SCHEDULE_LOCKED',
      aggregateType: 'Division',
      aggregateId: 'division-id',
      actorId: 'operator-id',
      correlationId: 'request-3',
      metadata: expect.objectContaining({ fixtureCount: 6 }),
    }));
  });
});
});
