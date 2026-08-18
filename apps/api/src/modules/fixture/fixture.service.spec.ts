import { describe, expect, it, vi } from 'vitest';
import { buildRoundRobin, ensureMatchWeeks } from './fixture.service.js';

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
