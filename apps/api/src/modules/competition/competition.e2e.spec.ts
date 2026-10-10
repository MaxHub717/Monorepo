import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPETITION_TIMEZONE,
  buildPhasePlots,
  buildPhaseSequence,
  buildSeriesForPlot,
  calculateSeasonCapacity,
  normalizeOddField,
  planPhaseTransition,
  resolveSeriesAdvancement,
  scheduleSeriesAutomatically,
  validateSeasonWindow,
  validateSeriesSchedule,
} from './competition.domain.js';

const seasonStart = '2027-01-04T00:00:00.000Z';
const seasonEnd = '2027-03-29T00:00:00.000Z';

function makeSeries(id: string, homePlayerId: string, awayPlayerId: string, winnerPlayerId: string) {
  const games = Array.from({ length: 3 }, (_, index) => {
    const homeWins = winnerPlayerId === homePlayerId;
    const winner = index < 2 ? winnerPlayerId : homeWins ? awayPlayerId : homePlayerId;
    return {
      gameNumber: index + 1,
      homePlayerId,
      awayPlayerId,
      status: 'COMPLETED' as const,
      result: winner === homePlayerId ? 'HOME_WIN' as const : 'AWAY_WIN' as const,
      winnerPlayerId: winner,
    };
  });
  return {
    id,
    status: 'COMPLETED' as const,
    games,
    advancement: resolveSeriesAdvancement({ seriesId: id, games }),
  };
}

function scheduledAppointment(seriesId: string, matchWindowStartAt: string, playerIds = ['p-1', 'p-2']) {
  const startAt = new Date(matchWindowStartAt).getTime();
  return {
    seriesId,
    phaseId: 'phase-1',
    playerIds,
    scheduleKey: `${seriesId}:schedule`,
    checkInOpensAt: new Date(startAt - 60 * 60 * 1000).toISOString(),
    checkInClosesAt: new Date(startAt - 30 * 60 * 1000).toISOString(),
    matchWindowStartAt,
    matchWindowEndAt: new Date(startAt + 60 * 60 * 1000).toISOString(),
    resultsDeadlineAt: new Date(startAt + 90 * 60 * 1000).toISOString(),
    timezone: 'UTC',
    gameNumbers: [1, 2, 3],
  };
}

function validateAppointment(
  appointment: ReturnType<typeof scheduledAppointment>,
  overrides: { automatic?: boolean; seasonStartAt?: string; phaseStartAt?: string } = {},
) {
  return validateSeriesSchedule({
    automatic: overrides.automatic ?? false,
    competitionTimezone: 'UTC',
    seasonStartAt: overrides.seasonStartAt ?? '2027-01-01T00:00:00.000Z',
    seasonEndAt: '2027-01-20T00:00:00.000Z',
    phases: [{
      id: 'phase-1',
      startAt: overrides.phaseStartAt ?? '2027-01-01T00:00:00.000Z',
      endAt: '2027-01-20T00:00:00.000Z',
    }],
    series: [{ id: appointment.seriesId, phaseId: 'phase-1', playerIds: appointment.playerIds }],
    appointments: [appointment],
  });
}

describe('COMP-016 competition engine end-to-end verification', () => {
  it.each([4, 8])('generates the initial phase for a %i-player field', (playerCount) => {
    const playerIds = Array.from({ length: playerCount }, (_, index) => `p-${index + 1}`);
    const phases = buildPhaseSequence({ approvedFieldSize: playerCount, seasonStart, seasonEnd });
    const plots = buildPhasePlots({ playerIds, phaseNumber: 1 });
    const series = plots.flatMap((plot) => buildSeriesForPlot({
      plot,
      phaseNumber: 1,
      seasonId: `season-e2e-${playerCount}`,
      playerOrder: playerIds,
    }));

    expect(phases[0].playerCount).toBe(playerCount);
    expect(plots.flatMap((plot) => plot.playerIds).sort()).toEqual(playerIds.sort());
    expect(series).toHaveLength(playerCount === 4 ? 6 : 28);
    expect(series.every((entry) => entry.games.length === 3)).toBe(true);
  });

  it('normalizes an odd field and generates a valid even advancement field', () => {
    const oddField = ['p-1', 'p-2', 'p-3', 'p-4', 'p-5'];
    const normalized = normalizeOddField({
      playerIds: oddField,
      phaseNumber: 1,
      seasonId: 'season-e2e-odd',
      approvedOrder: oddField,
      normalizationOutcome: 'HOME_WIN',
    });
    const plots = buildPhasePlots({ playerIds: normalized.remainingPlayers, phaseNumber: 1 });
    const series = plots.flatMap((plot) => buildSeriesForPlot({
      plot,
      phaseNumber: 1,
      seasonId: 'season-e2e-odd',
    }));

    expect(normalized.needsNormalization).toBe(true);
    expect(normalized.normalizationSeries.players).toEqual(['p-1', 'p-2']);
    expect(normalized.remainingPlayers).toEqual(['p-1', 'p-3', 'p-4', 'p-5']);
    expect(series).toHaveLength(6);
    expect(series.flatMap((entry) => entry.players).every((playerId) => normalized.remainingPlayers.includes(playerId))).toBe(true);
  });

  it.each([
    [32, 240],
    [100, 950],
    [500, 12250],
    [1000, 49500],
  ])('generates %i-player first-phase pairings within 30 seconds', (playerCount, expectedSeriesCount) => {
    const startedAt = Date.now();
    const playerIds = Array.from({ length: playerCount }, (_, index) => `p-${index + 1}`);
    const plots = buildPhasePlots({ playerIds, phaseNumber: 1 });
    let generatedSeriesCount = 0;
    let generatedGameCount = 0;
    for (const plot of plots) {
      const series = buildSeriesForPlot({ plot, phaseNumber: 1, seasonId: `season-e2e-${playerCount}` });
      generatedSeriesCount += series.length;
      generatedGameCount += series.reduce((count, entry) => count + entry.games.length, 0);
    }

    expect(generatedSeriesCount).toBe(expectedSeriesCount);
    expect(generatedGameCount).toBe(expectedSeriesCount * 3);
    expect(Date.now() - startedAt).toBeLessThan(30_000);
  });

  it('enforces short-season capacity and reserves the final week in a 12-week Season', () => {
    expect(() => buildPhaseSequence({
      approvedFieldSize: 8,
      seasonStart: '2027-01-01T00:00:00.000Z',
      seasonEnd: '2027-01-10T00:00:00.000Z',
    })).toThrow('cannot accommodate the required competition');

    const twelveWeekEnd = '2027-03-29T00:00:00.000Z';
    const phases = buildPhaseSequence({
      approvedFieldSize: 8,
      seasonStart: '2027-01-04T00:00:00.000Z',
      seasonEnd: twelveWeekEnd,
    });
    const finalWeekStart = Date.parse(twelveWeekEnd) - 7 * 24 * 60 * 60 * 1000;
    expect(Date.parse(phases.at(-1)!.startDate.toString())).toBeGreaterThanOrEqual(finalWeekStart);
    expect(Date.parse(phases.at(-1)!.endDate.toString())).toBeLessThanOrEqual(Date.parse(twelveWeekEnd));

    const feasibleCapacity = calculateSeasonCapacity({
      seasonStartAt: '2027-01-04T00:00:00.000Z',
      seasonEndAt: twelveWeekEnd,
      currentDate: '2027-01-04T00:00:00.000Z',
      competitionTimezone: DEFAULT_COMPETITION_TIMEZONE,
      currentPhaseNumber: 0,
      remainingPhases: [{ phaseNumber: 1, seriesCount: 1 }, { phaseNumber: 2, seriesCount: 1 }],
    });
    expect(feasibleCapacity.feasible).toBe(true);
    expect(Date.parse(feasibleCapacity.phases.at(-1)!.startAt!)).toBeGreaterThanOrEqual(finalWeekStart);

    const insufficientCapacity = calculateSeasonCapacity({
      seasonStartAt: '2027-01-04T00:00:00.000Z',
      seasonEndAt: twelveWeekEnd,
      currentDate: '2027-01-04T00:00:00.000Z',
      competitionTimezone: DEFAULT_COMPETITION_TIMEZONE,
      currentPhaseNumber: 0,
      remainingPhases: [{ phaseNumber: 1, seriesCount: 1 }, { phaseNumber: 2, seriesCount: 100 }],
    });
    expect(insufficientCapacity.feasible).toBe(false);
    expect(insufficientCapacity.blockers.some((blocker) => blocker.code === 'INSUFFICIENT_FINAL_WEEK_CAPACITY')).toBe(true);
    expect(() => validateSeasonWindow('2027-01-15T00:00:00.000Z', '2027-01-10T00:00:00.000Z', DEFAULT_COMPETITION_TIMEZONE))
      .toThrow('Season end date must be after the start date');
  });

  it.each([
    ['2-1 home win', ['HOME_WIN', 'AWAY_WIN', 'HOME_WIN'], 'p-1'],
    ['1-2 away win', ['AWAY_WIN', 'HOME_WIN', 'AWAY_WIN'], 'p-2'],
  ] as const)('resolves a %s series only after all three Games', (_label, results, expectedWinner) => {
    const games = results.map((result, index) => ({
      gameNumber: index + 1,
      homePlayerId: 'p-1',
      awayPlayerId: 'p-2',
      status: 'COMPLETED' as const,
      result,
      winnerPlayerId: result === 'HOME_WIN' ? 'p-1' : 'p-2',
    }));
    const pendingThirdGame = resolveSeriesAdvancement({
      seriesId: 'series-incomplete',
      games: [...games.slice(0, 2), {
        gameNumber: 3,
        homePlayerId: 'p-1',
        awayPlayerId: 'p-2',
        status: 'PENDING',
        result: null,
        winnerPlayerId: null,
      }],
    });
    const resolved = resolveSeriesAdvancement({ seriesId: 'series-complete', games });

    expect(pendingThirdGame.state).toBe('PENDING');
    expect(pendingThirdGame.advancingPlayerId).toBeNull();
    expect(pendingThirdGame.audit).toBeNull();
    expect(resolved.state).toBe('ADVANCED');
    expect(resolved.advancingPlayerId).toBe(expectedWinner);
  });

  it.each([1, 2, 3])('eliminates both participants when Game %i is drawn', (drawnGameNumber) => {
    const games = [1, 2, 3].map((gameNumber) => ({
      gameNumber,
      homePlayerId: 'p-1',
      awayPlayerId: 'p-2',
      status: (gameNumber <= drawnGameNumber ? 'COMPLETED' : 'PENDING') as 'COMPLETED' | 'PENDING',
      result: gameNumber === drawnGameNumber ? 'DRAW' as const : gameNumber < drawnGameNumber ? 'HOME_WIN' as const : null,
      winnerPlayerId: gameNumber === drawnGameNumber ? null : gameNumber < drawnGameNumber ? 'p-1' : null,
    }));
    const result = resolveSeriesAdvancement({ seriesId: `series-draw-${drawnGameNumber}`, games });

    expect(result.state).toBe('ELIMINATED');
    expect(result.advancingPlayerId).toBeNull();
    expect(result.eliminatedPlayerIds).toEqual(['p-1', 'p-2']);
    expect(result.reason).toBe('GAME_DRAW');
  });

  it('keeps unresolved series pending, then eliminates both if all three games remain unresolved', () => {
    const games = [
      { gameNumber: 1, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'COMPLETED' as const, result: 'HOME_WIN' as const, winnerPlayerId: 'p-1' },
      { gameNumber: 2, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'COMPLETED' as const, result: 'HOME_WIN' as const, winnerPlayerId: 'p-1' },
      { gameNumber: 3, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'PENDING' as const, result: null, winnerPlayerId: null },
    ];
    const pending = resolveSeriesAdvancement({ seriesId: 'series-unresolved-pending', games });
    const finalizedUnresolved = resolveSeriesAdvancement({
      seriesId: 'series-unresolved-final',
      games: [...games.slice(0, 2), { ...games[2], status: 'COMPLETED', result: 'UNRESOLVED' }],
    });

    expect(pending.state).toBe('PENDING');
    expect(pending.advancingPlayerId).toBeNull();
    expect(finalizedUnresolved.state).toBe('ELIMINATED');
    expect(finalizedUnresolved.eliminatedPlayerIds).toEqual(['p-1', 'p-2']);
  });

  it('transitions only finalized winners into the next Phase and regenerates plots and Series', () => {
    const first = makeSeries('series-1', 'p-1', 'p-2', 'p-1');
    const second = makeSeries('series-2', 'p-3', 'p-4', 'p-3');
    const transition = planPhaseTransition({
      seasonId: 'season-transition',
      seasonStart,
      seasonEnd,
      transitionAt: '2027-02-01T00:00:00.000Z',
      nextPhaseId: 'phase-2',
      currentPhase: {
        id: 'phase-1',
        phaseNumber: 1,
        status: 'COMPLETED',
        endAt: '2027-02-01T00:00:00.000Z',
        plotCount: 2,
      },
      series: [first, second],
    });

    expect(transition.advancementPool).toEqual(['p-1', 'p-3']);
    expect(transition.nextPhase).toMatchObject({ phaseNumber: 2, participatingPlayerIds: ['p-1', 'p-3'], status: 'DRAFT' });
    expect(transition.plots.flatMap((plot) => plot.playerIds)).toEqual(['p-1', 'p-3']);
    expect(transition.series).toHaveLength(1);
    expect(transition.series[0].games).toHaveLength(3);
    expect(() => planPhaseTransition({
      seasonId: 'season-transition',
      seasonStart,
      seasonEnd,
      transitionAt: '2027-02-01T00:00:00.000Z',
      nextPhaseId: 'phase-2',
      currentPhase: { id: 'phase-1', phaseNumber: 1, status: 'COMPLETED', plotCount: 2 },
      series: [{ ...first, games: first.games.slice(0, 2) }],
    })).toThrow('exactly three games');
  });

  it('validates participant conflicts and each automatic scheduling boundary', () => {
    const conflictingSchedule = validateSeriesSchedule({
      automatic: false,
      competitionTimezone: 'UTC',
      seasonStartAt: '2027-01-01T00:00:00.000Z',
      seasonEndAt: '2027-01-20T00:00:00.000Z',
      phases: [{ id: 'phase-1', startAt: '2027-01-01T00:00:00.000Z', endAt: '2027-01-20T00:00:00.000Z' }],
      series: [
        { id: 'series-1', phaseId: 'phase-1', playerIds: ['p-1', 'p-2'] },
        { id: 'series-2', phaseId: 'phase-1', playerIds: ['p-2', 'p-3'] },
      ],
      appointments: [
        scheduledAppointment('series-1', '2027-01-04T10:00:00.000Z'),
        scheduledAppointment('series-2', '2027-01-04T10:30:00.000Z', ['p-2', 'p-3']),
      ],
    });
    expect(conflictingSchedule.errors.some((error) => error.code === 'PARTICIPANT_DOUBLE_BOOKING')).toBe(true);

    expect(validateAppointment(scheduledAppointment('series-sunday', '2027-01-10T10:00:00.000Z'), { automatic: true })
      .errors.map((error) => error.code)).toContain('SUNDAY_AUTOMATIC_SCHEDULE');
    expect(validateAppointment(scheduledAppointment('series-early', '2027-01-04T09:00:00.000Z'))
      .errors.map((error) => error.code)).toContain('INVALID_MATCH_WINDOW');
    expect(validateAppointment(scheduledAppointment('series-late', '2027-01-04T21:30:00.000Z'))
      .errors.map((error) => error.code)).toContain('INVALID_MATCH_WINDOW');
    expect(validateAppointment(scheduledAppointment('series-phase-boundary', '2027-01-04T10:00:00.000Z'), {
      phaseStartAt: '2027-01-04T11:00:00.000Z',
    }).errors.map((error) => error.code)).toContain('OUTSIDE_PHASE_BOUNDARIES');
    expect(validateAppointment(scheduledAppointment('series-season-boundary', '2027-01-04T10:00:00.000Z'), {
      seasonStartAt: '2027-01-04T11:00:00.000Z',
    }).errors.map((error) => error.code)).toContain('OUTSIDE_SEASON_BOUNDARIES');
  });

  it('verifies the full Season lifecycle from registration to final completion using the canonical competition engine', () => {
    const playerIds = Array.from({ length: 8 }, (_, index) => `p-${index + 1}`);
    const phases = buildPhaseSequence({ approvedFieldSize: 8, seasonStart, seasonEnd });
    const firstPhasePlots = buildPhasePlots({ playerIds, phaseNumber: 1 });
    const firstPhaseSeries = firstPhasePlots.flatMap((plot) => buildSeriesForPlot({
      plot,
      phaseNumber: 1,
      seasonId: 'season-adm-032',
      playerOrder: playerIds,
    }));

    expect(phases).toHaveLength(4);
    expect(firstPhasePlots).toHaveLength(1);
    expect(firstPhaseSeries).toHaveLength(28);
    expect(firstPhaseSeries.every((entry) => entry.games.length === 3)).toBe(true);

    const scheduled = scheduleSeriesAutomatically({
      competitionTimezone: DEFAULT_COMPETITION_TIMEZONE,
      seasonStartAt: seasonStart,
      seasonEndAt: seasonEnd,
      currentDate: '2027-01-04T00:00:00.000Z',
      currentPhaseNumber: 0,
      phases: [{ id: 'phase-1', startAt: '2027-01-04T00:00:00.000Z', endAt: '2027-02-15T00:00:00.000Z' }],
      series: firstPhaseSeries.map((entry) => ({
        id: entry.seriesKey,
        phaseId: 'phase-1',
        playerIds: entry.players,
      })),
    });

    expect(scheduled.feasible).toBe(true);
    expect(scheduled.validation.valid).toBe(true);
    expect(scheduled.scheduledSeries.every((appointment) => appointment.gameNumbers.length === 3)).toBe(true);

    const resolvedSeries = [
      makeSeries('series-1', 'p-1', 'p-2', 'p-1'),
      makeSeries('series-2', 'p-3', 'p-4', 'p-3'),
    ];

    expect(resolvedSeries.every((entry) => entry.advancement.state === 'ADVANCED')).toBe(true);

    const nextPhase = planPhaseTransition({
      seasonId: 'season-adm-032',
      seasonStart,
      seasonEnd,
      transitionAt: '2027-02-01T00:00:00.000Z',
      nextPhaseId: 'phase-2',
      currentPhase: {
        id: 'phase-1',
        phaseNumber: 1,
        status: 'COMPLETED',
        endAt: '2027-02-01T00:00:00.000Z',
        plotCount: 1,
      },
      series: resolvedSeries,
    });

    expect(nextPhase.advancementPool.length).toBeGreaterThanOrEqual(2);
    expect(nextPhase.nextPhase.phaseType).toBe('PLAYOFF');
    expect(nextPhase.series.every((entry) => entry.games.length === 3)).toBe(true);

    const seasonCapacity = calculateSeasonCapacity({
      seasonStartAt: seasonStart,
      seasonEndAt: seasonEnd,
      currentDate: '2027-01-04T00:00:00.000Z',
      competitionTimezone: DEFAULT_COMPETITION_TIMEZONE,
      currentPhaseNumber: 0,
      remainingPhases: [{ phaseNumber: 1, seriesCount: 28 }, { phaseNumber: 2, seriesCount: 14 }, { phaseNumber: 3, seriesCount: 6 }],
    });

    expect(seasonCapacity.feasible).toBe(true);
    expect(seasonCapacity.phases.at(-1)?.isFinalPhase).toBe(true);
  });
});
