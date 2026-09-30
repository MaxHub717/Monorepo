import { describe, expect, it, vi } from 'vitest';
import { FixtureService, buildRoundRobin, ensureMatchWeeks } from './fixture.service.js';

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
});

describe('FixtureService.generateDivisionSchedule', () => {
  const participants = [
    { player_id: 'player-a', seed: 1, registered_at: new Date('2026-01-01T00:00:00Z') },
    { player_id: 'player-b', seed: 2, registered_at: new Date('2026-01-02T00:00:00Z') },
    { player_id: 'player-c', seed: 3, registered_at: new Date('2026-01-03T00:00:00Z') },
    { player_id: 'player-d', seed: 4, registered_at: new Date('2026-01-04T00:00:00Z') },
  ];

  it('persists a numbered, round-assigned single round robin transactionally', async () => {
    const createdFixtures: any[] = [];
    const tx: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      division: { findUnique: vi.fn().mockResolvedValue({ id: 'division-id', season_id: 'season-id', name: 'Division 1', active: true, format: 'ROUND_ROBIN_SINGLE' }) },
      divisionParticipant: { findMany: vi.fn().mockResolvedValue(participants) },
      fixture: {
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

    expect(result).toMatchObject({ status: 'GENERATED', participantCount: 4, roundCount: 3, expectedFixtureCount: 6, fixtureCount: 6 });
    expect(createdFixtures.map(({ fixture_number }) => fixture_number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(createdFixtures.every(({ status }) => status === 'SCHEDULED')).toBe(true);
    expect(tx.match.create).toHaveBeenCalledTimes(6);
    expect(tx.matchParticipant.createMany).toHaveBeenCalledTimes(6);
    expect(outbox.enqueueEvent).toHaveBeenCalledWith(tx, expect.objectContaining({ eventName: 'division.fixtures_generated' }));
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
    const fixtures = pairings.map((pairing, index) => {
      const [first, second] = [pairing.homePlayerId, pairing.awayPlayerId].sort();
      return {
        id: `fixture-${index + 1}`,
        schedule_key: `${first}:${second}:${pairing.leg}`,
        fixture_number: index + 1,
        match_week: { week_number: pairing.round },
        home_player_id: pairing.homePlayerId,
        away_player_id: pairing.awayPlayerId,
        match: { id: `match-${index + 1}` },
      };
    });
    const tx: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      division: { findUnique: vi.fn().mockResolvedValue({ id: 'division-id', season_id: 'season-id', name: 'Division 1', active: true, format: 'ROUND_ROBIN_SINGLE' }) },
      divisionParticipant: { findMany: vi.fn().mockResolvedValue(participants) },
      fixture: { findMany: vi.fn().mockResolvedValue(fixtures) },
    };
    const service = new FixtureService({ $transaction: (callback: any) => callback(tx) } as any, {} as any);

    const result = await service.generateDivisionSchedule('season-id', 'division-id');

    expect(result).toMatchObject({ status: 'ALREADY_GENERATED', fixtureCount: 6, expectedFixtureCount: 6 });
  });

  it('does not treat a partial generated schedule as complete', async () => {
    const tx: any = {
      season: { findUnique: vi.fn().mockResolvedValue({ id: 'season-id', status: 'ROSTER_LOCKED' }) },
      division: { findUnique: vi.fn().mockResolvedValue({ id: 'division-id', season_id: 'season-id', name: 'Division 1', active: true, format: 'ROUND_ROBIN_SINGLE' }) },
      divisionParticipant: { findMany: vi.fn().mockResolvedValue(participants) },
      fixture: { findMany: vi.fn().mockResolvedValue([{ id: 'fixture-1', schedule_key: 'player-a:player-b:1' }]) },
    };
    const service = new FixtureService({ $transaction: (callback: any) => callback(tx) } as any, {} as any);

    await expect(service.generateDivisionSchedule('season-id', 'division-id')).rejects.toThrow(
      'do not match the complete generated schedule of 6',
    );
  });
});
