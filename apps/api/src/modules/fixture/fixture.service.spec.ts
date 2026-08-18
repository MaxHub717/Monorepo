import { describe, expect, it } from 'vitest';
import { buildRoundRobin } from './fixture.service.js';

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
