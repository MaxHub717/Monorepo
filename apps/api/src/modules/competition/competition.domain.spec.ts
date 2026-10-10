import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_COMPETITION_RULES,
  buildPlayerFacingRules,
  DEFAULT_COMPETITION_TIMEZONE,
  assessPhaseCompletion,
  buildPhasePlots,
  buildPhaseSequence,
  buildSeriesForPlot,
  calculatePhaseProgression,
  calculateExpectedPhaseDepth,
  calculateInitialPlotCount,
  calculateLaterPlotCount,
  calculateSeasonCapacity,
  assertCheckInAllowed,
  assertGameInActiveSeriesWindow,
  assertSeriesCanStart,
  assertSeriesResultSubmissionAllowed,
  assertSeriesScheduleCanLock,
  adjustSeriesAppointment,
  createGameSlots,
  deriveSeriesOperationalState,
  estimateSeriesCountsForPlayerField,
  normalizeOddField,
  planPhaseTransition,
  recordGameResult,
  resolveSeriesAdvancement,
  resolveSeriesResult,
  scheduleSeriesAutomatically,
  validateCompetitionRules,
  validateSeriesSchedule,
  validateFinalPhaseWindow,
  validatePhaseWindow,
  validateSeasonWindow,
  validateSeriesMatchWindow,
} from './competition.domain.js';

describe('COMP-001 competition domain foundation', () => {
  it('blocks phase completion until all completion gates pass and finalizes eligible survivors', () => {
    const series = [{
      id: 'series-1',
      status: 'COMPLETED',
      playerIds: ['p-1', 'p-2'],
      winnerPlayerId: 'p-1',
      eliminatedPlayerIds: ['p-2'],
      advancementFinalized: true,
      games: [1, 2, 3].map((gameNumber) => ({
        status: gameNumber === 3 ? 'PENDING' : 'COMPLETED',
        result: gameNumber === 3 ? null : 'HOME_WIN' as const,
        currentVerificationStatus: gameNumber === 3 ? null : 'APPROVED',
      })),
    }];
    const base = {
      participantIds: ['p-1', 'p-2'],
      plots: [{ id: 'plot-1', name: 'Plot 1', playerIds: ['p-1', 'p-2'] }],
      series,
      blockOnUnresolvedDisputes: true,
      unresolvedDisputeCount: 0,
      unappliedPenaltyCount: 0,
      nextPhaseRequired: false,
      nextPhaseTimingFeasible: true,
    };

    const incomplete = assessPhaseCompletion(base);
    expect(incomplete.ready).toBe(false);
    expect(incomplete.blockers.map((blocker) => blocker.code)).toContain('GAMES_INCOMPLETE');
    expect(incomplete.progression.advancementEligiblePlayerIds).toEqual([]);

    const ready = assessPhaseCompletion({
      ...base,
      series: [{
        ...series[0],
        games: series[0].games.map(() => ({
          status: 'COMPLETED',
          result: 'HOME_WIN' as const,
          currentVerificationStatus: 'APPROVED',
        })),
      }],
    });
    expect(ready.ready).toBe(true);
    expect(ready.progression.advancementEligiblePlayerIds).toEqual(['p-1']);

    const insufficientField = assessPhaseCompletion({
      ...base,
      nextPhaseRequired: true,
      series: [{
        ...series[0],
        games: series[0].games.map(() => ({
          status: 'COMPLETED',
          result: 'HOME_WIN' as const,
          currentVerificationStatus: 'APPROVED',
        })),
      }],
    });
    expect(insufficientField.blockers.map((blocker) => blocker.code)).toContain('INSUFFICIENT_ADVANCEMENT_FIELD');
  });

  it('applies configured dispute blocking and rejects pending penalty effects or infeasible timing', () => {
    const result = assessPhaseCompletion({
      participantIds: ['p-1', 'p-2'],
      plots: [{ id: 'plot-1', name: 'Plot 1', playerIds: ['p-1', 'p-2'] }],
      series: [],
      blockOnUnresolvedDisputes: true,
      unresolvedDisputeCount: 1,
      unappliedPenaltyCount: 1,
      nextPhaseRequired: true,
      nextPhaseTimingFeasible: false,
      nextPhaseTimingReason: 'Season window is too short.',
    });

    expect(result.blockers.map((blocker) => blocker.code)).toEqual(expect.arrayContaining([
      'NO_SERIES',
      'UNRESOLVED_DISPUTES',
      'PENALTY_EFFECTS_PENDING',
      'NEXT_PHASE_TIMING_INFEASIBLE',
    ]));

    const disputePolicyDisabled = assessPhaseCompletion({
      participantIds: [],
      plots: [],
      series: [],
      blockOnUnresolvedDisputes: false,
      unresolvedDisputeCount: 3,
      unappliedPenaltyCount: 0,
      nextPhaseRequired: false,
      nextPhaseTimingFeasible: true,
    });
    expect(disputePolicyDisabled.blockers.map((blocker) => blocker.code)).not.toContain('UNRESOLVED_DISPUTES');
  });

  it('keeps season boundaries explicit and valid', () => {
    expect(() =>
      validateSeasonWindow(
        new Date('2027-01-15T00:00:00Z'),
        new Date('2027-01-10T00:00:00Z'),
        DEFAULT_COMPETITION_TIMEZONE,
      ),
    ).toThrow('Season end date must be after the start date');

    expect(() =>
      validateSeasonWindow(
        new Date('2027-01-10T00:00:00Z'),
        new Date('2027-03-31T00:00:00Z'),
        '',
      ),
    ).toThrow('Competition timezone is required');
  });

  it('requires phases to stay within the season lifetime', () => {
    const seasonStart = new Date('2027-01-01T00:00:00Z');
    const seasonEnd = new Date('2027-03-31T00:00:00Z');

    expect(() =>
      validatePhaseWindow(
        new Date('2026-12-20T00:00:00Z'),
        new Date('2027-01-05T00:00:00Z'),
        seasonStart,
        seasonEnd,
      ),
    ).toThrow('Phase must fit within the season lifetime');

    expect(() =>
      validateFinalPhaseWindow(
        new Date('2027-03-21T00:00:00Z'),
        new Date('2027-03-31T23:00:00Z'),
        seasonStart,
        seasonEnd,
      ),
    ).toThrow('Final phase must finish within the final week of the season');
  });

  it('creates exactly three games for a series and rejects invalid match windows', () => {
    expect(createGameSlots()).toHaveLength(3);

    expect(() =>
      validateSeriesMatchWindow({
        start: '09:00',
        end: '10:00',
        timezone: DEFAULT_COMPETITION_TIMEZONE,
      }),
    ).toThrow('Series match window must fall within 10:00-22:00');

    expect(() =>
      validateSeriesMatchWindow({
        start: '10:00',
        end: '23:00',
        timezone: DEFAULT_COMPETITION_TIMEZONE,
      }),
    ).toThrow('Series match window must fall within 10:00-22:00');
  });

  it('calculates the expected phase depth deterministically', () => {
    expect(calculateExpectedPhaseDepth(8)).toBe(4);
    expect(calculateExpectedPhaseDepth(16)).toBe(5);
    expect(calculateExpectedPhaseDepth(32)).toBe(6);
    expect(calculateExpectedPhaseDepth(100)).toBe(8);
  });

  it('builds a phase sequence from the approved field and actual survivor counts', () => {
    const phases = buildPhaseSequence({
      approvedFieldSize: 12,
      survivorCounts: [12, 6, 3, 1],
      seasonStart: '2027-01-01T00:00:00Z',
      seasonEnd: '2027-03-31T00:00:00Z',
    });

    expect(phases.map((phase) => phase.phaseNumber)).toEqual([1, 2, 3, 4]);
    expect(phases[0].playerCount).toBe(12);
    expect(phases[3].isFinalPhase).toBe(true);
    expect(new Date(phases[3].endDate).getTime()).toBeLessThanOrEqual(new Date('2027-03-31T00:00:00Z').getTime());
  });

  it('rejects a season whose remaining lifetime cannot accommodate the required competition', () => {
    expect(() =>
      buildPhaseSequence({
        approvedFieldSize: 128,
        seasonStart: '2027-01-01T00:00:00Z',
        seasonEnd: '2027-01-10T00:00:00Z',
      }),
    ).toThrow('cannot accommodate the required competition');
  });

  it('calculates the correct initial and later plot counts', () => {
    expect(calculateInitialPlotCount(20)).toBe(1);
    expect(calculateInitialPlotCount(201)).toBe(10);
    expect(calculateLaterPlotCount(10, 100)).toBe(5);
    expect(calculateLaterPlotCount(5, 100)).toBe(4);
    expect(calculateLaterPlotCount(2, 9)).toBe(1);
  });

  it('distributes all players into phase-scoped plots without duplication', () => {
    const players = Array.from({ length: 100 }, (_, index) => `player-${index + 1}`);
    const plots = buildPhasePlots({
      playerIds: players,
      previousPlotCount: 10,
      phaseNumber: 1,
    });

    const flattened = plots.flatMap((plot) => plot.playerIds);
    expect(flattened).toHaveLength(players.length);
    expect(new Set(flattened).size).toBe(players.length);
    expect(plots).toHaveLength(5);
    expect(plots.every((plot) => plot.playerIds.length > 0)).toBe(true);
  });

  it('respects seeding when constructing plots', () => {
    const players = ['p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6'];
    const plots = buildPhasePlots({
      playerIds: players,
      previousPlotCount: 3,
      seedOrder: ['p-2', 'p-5', 'p-1', 'p-6', 'p-4', 'p-3'],
    });

    expect(plots[0].playerIds[0]).toBe('p-2');
    expect(plots[0].playerIds).toContain('p-5');
  });

  it('creates deterministic series and three games from a plot', () => {
    const plot = {
      id: 'plot-1',
      phaseId: 'phase-1',
      name: 'Plot 1',
      playerIds: ['p-1', 'p-2', 'p-3', 'p-4'],
      status: 'ACTIVE' as const,
      seriesCollection: [],
    };

    const series = buildSeriesForPlot({
      plot,
      phaseNumber: 1,
      seasonId: 'season-1',
      playerOrder: ['p-1', 'p-2', 'p-3', 'p-4'],
    });

    expect(series).toHaveLength(6);
    expect(series.every((entry) => entry.players.length === 2)).toBe(true);
    expect(series.every((entry) => entry.games.length === 3)).toBe(true);
    expect(series.map((entry) => entry.seriesNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(series[0].games.every((game) => game.phaseId === 'phase-1')).toBe(true);
    expect(series[0].games.every((game) => game.plotId === 'plot-1')).toBe(true);
  });

  it('is idempotent and does not duplicate series on retry', () => {
    const plot = {
      id: 'plot-2',
      phaseId: 'phase-2',
      name: 'Plot 2',
      playerIds: ['p-1', 'p-2', 'p-3', 'p-4'],
      status: 'ACTIVE' as const,
      seriesCollection: [],
    };

    const first = buildSeriesForPlot({
      plot,
      phaseNumber: 2,
      seasonId: 'season-1',
      playerOrder: ['p-1', 'p-2', 'p-3', 'p-4'],
    });
    const second = buildSeriesForPlot({
      plot,
      phaseNumber: 2,
      seasonId: 'season-1',
      playerOrder: ['p-1', 'p-2', 'p-3', 'p-4'],
    });

    expect(first).toEqual(second);
    expect(first.map((entry) => entry.seriesKey)).toEqual(second.map((entry) => entry.seriesKey));
  });

  it('detects odd fields and creates an explicit normalization series without bye generation', () => {
    const result = normalizeOddField({
      playerIds: ['p-9', 'p-8', 'p-7', 'p-6', 'p-5'],
      phaseNumber: 1,
      seasonId: 'season-1',
      approvedOrder: ['p-5', 'p-6', 'p-7', 'p-8', 'p-9'],
    });

    expect(result.needsNormalization).toBe(true);
    expect(result.normalizationSeries.players).toEqual(['p-5', 'p-6']);
    expect(result.evenField).toEqual(['p-5', 'p-7', 'p-8', 'p-9']);
    expect(result.normalizationSeries.games).toHaveLength(3);
    expect(result.operatorNote).toContain('normalization');
  });

  it('eliminates both players on a normalization draw and preserves a deterministic winner when there is one', () => {
    const drawResult = normalizeOddField({
      playerIds: ['p-2', 'p-1', 'p-3'],
      phaseNumber: 2,
      seasonId: 'season-2',
      approvedOrder: ['p-1', 'p-2', 'p-3'],
      normalizationOutcome: 'DRAW',
    });

    expect(drawResult.normalizationSeries.result).toBe('DRAW');
    expect(drawResult.remainingPlayers).toEqual(['p-3']);

    const winResult = normalizeOddField({
      playerIds: ['p-2', 'p-1', 'p-3'],
      phaseNumber: 2,
      seasonId: 'season-2',
      approvedOrder: ['p-1', 'p-2', 'p-3'],
      normalizationOutcome: 'HOME_WIN',
    });

    expect(winResult.normalizationSeries.result).toBe('HOME_WIN');
    expect(winResult.remainingPlayers).toEqual(['p-1', 'p-3']);
  });

  it('records a game result with independent audit metadata and prevents duplicate results', () => {
    const game = {
      gameNumber: 1,
      homePlayerId: 'p-1',
      awayPlayerId: 'p-2',
      status: 'PENDING' as const,
      result: null,
      winnerPlayerId: null,
      completedAt: null,
      resultRecordedAt: null,
      resultRecordedById: null,
      resultVersion: 0,
    };

    const recorded = recordGameResult({
      game,
      result: 'HOME_WIN',
      recordedAt: '2027-01-12T18:00:00.000Z',
      recordedById: 'admin-1',
      reason: 'Verified score report',
    });

    expect(recorded.game).toMatchObject({
      status: 'COMPLETED',
      result: 'HOME_WIN',
      winnerPlayerId: 'p-1',
      resultRecordedById: 'admin-1',
      resultVersion: 1,
    });
    expect(recorded.audit).toMatchObject({
      action: 'RESULT_RECORDED',
      actorId: 'admin-1',
      reason: 'Verified score report',
      resultVersion: 1,
    });
    const afterScoreRevision = recordGameResult({
      game: { ...game, status: 'IN_PROGRESS', resultVersion: 2 },
      result: 'HOME_WIN',
      recordedAt: '2027-01-12T18:01:00.000Z',
    });
    expect(afterScoreRevision.game.resultVersion).toBe(3);
    expect(() => recordGameResult({ game: recorded.game, result: 'AWAY_WIN' })).toThrow('already has a result');
  });

  it('aggregates exactly three game outcomes and does not normally complete an incomplete series', () => {
    const games = [
      { gameNumber: 1, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'COMPLETED' as const, result: 'HOME_WIN' as const, winnerPlayerId: 'p-1' },
      { gameNumber: 2, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'COMPLETED' as const, result: 'DRAW' as const, winnerPlayerId: null },
      { gameNumber: 3, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'PENDING' as const, result: null, winnerPlayerId: null },
    ];

    expect(() => resolveSeriesResult(games.slice(0, 2))).toThrow('exactly three games');
    expect(() => resolveSeriesResult([games[0], games[0], games[2]])).toThrow('each game number exactly once');

    const inProgress = resolveSeriesResult(games);
    expect(inProgress).toMatchObject({
      expectedGameCount: 3,
      completedGameCount: 2,
      homeWins: 1,
      awayWins: 0,
      draws: 1,
      resolutionState: 'DRAW',
      winnerPlayerId: null,
      eliminationOutcome: 'BOTH_ELIMINATED',
      eliminatedPlayerIds: ['p-1', 'p-2'],
    });

    const resolved = resolveSeriesResult([
      ...games.slice(0, 2),
      { ...games[2], status: 'COMPLETED' as const, result: 'AWAY_WIN' as const, winnerPlayerId: 'p-2' },
    ]);
    expect(resolved).toMatchObject({
      completedGameCount: 3,
      homeWins: 1,
      awayWins: 1,
      draws: 1,
      resolutionState: 'DRAW',
      eliminationOutcome: 'BOTH_ELIMINATED',
      winnerPlayerId: null,
      eliminatedPlayerIds: ['p-1', 'p-2'],
    });
  });

  it('advances the player with the 2-1 result in either direction and is idempotently auditable', () => {
    const games = (results: Array<'HOME_WIN' | 'AWAY_WIN'>) => results.map((result, index) => ({
      gameNumber: index + 1,
      homePlayerId: 'p-1',
      awayPlayerId: 'p-2',
      status: 'COMPLETED' as const,
      result,
      winnerPlayerId: result === 'HOME_WIN' ? 'p-1' : 'p-2',
    }));
    const input = {
      seriesId: 'series-1',
      actorId: 'admin-1',
      resolvedAt: '2027-01-13T18:00:00.000Z',
    };

    const homeAdvance = resolveSeriesAdvancement({ ...input, games: games(['HOME_WIN', 'AWAY_WIN', 'HOME_WIN']) });
    expect(homeAdvance).toMatchObject({
      state: 'ADVANCED',
      advancingPlayerId: 'p-1',
      eliminatedPlayerIds: ['p-2'],
      reason: 'NORMAL_RESULT',
      audit: { seriesId: 'series-1', actorId: 'admin-1', outcome: 'WINNER_ADVANCES' },
    });
    expect(resolveSeriesAdvancement({ ...input, games: games(['AWAY_WIN', 'HOME_WIN', 'AWAY_WIN']) }))
      .toMatchObject({ state: 'ADVANCED', advancingPlayerId: 'p-2', eliminatedPlayerIds: ['p-1'] });
    expect(resolveSeriesAdvancement({ ...input, games: games(['HOME_WIN', 'AWAY_WIN', 'HOME_WIN']) }))
      .toEqual(homeAdvance);
  });

  it('eliminates both players when any game is drawn, even if the win count otherwise favors one', () => {
    const outcome = resolveSeriesAdvancement({
      seriesId: 'series-draw',
      games: [
        { gameNumber: 1, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'COMPLETED', result: 'HOME_WIN', winnerPlayerId: 'p-1' },
        { gameNumber: 2, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'COMPLETED', result: 'HOME_WIN', winnerPlayerId: 'p-1' },
        { gameNumber: 3, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'COMPLETED', result: 'DRAW', winnerPlayerId: null },
      ],
    });

    expect(outcome).toMatchObject({
      state: 'ELIMINATED',
      advancingPlayerId: null,
      eliminatedPlayerIds: ['p-1', 'p-2'],
      reason: 'GAME_DRAW',
      audit: { outcome: 'BOTH_ELIMINATED' },
    });

    const earlyDraw = resolveSeriesAdvancement({
      seriesId: 'series-early-draw',
      games: [
        { gameNumber: 1, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'COMPLETED', result: 'HOME_WIN', winnerPlayerId: 'p-1' },
        { gameNumber: 2, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'COMPLETED', result: 'DRAW', winnerPlayerId: null },
        { gameNumber: 3, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'PENDING', result: null, winnerPlayerId: null },
      ],
    });
    expect(earlyDraw).toMatchObject({
      state: 'ELIMINATED',
      advancingPlayerId: null,
      eliminatedPlayerIds: ['p-1', 'p-2'],
      reason: 'GAME_DRAW',
    });
  });

  it('eliminates both on an unresolved result and blocks advancement until all games resolve', () => {
    const shared = {
      seriesId: 'series-unresolved',
      games: [
        { gameNumber: 1, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'COMPLETED' as const, result: 'HOME_WIN' as const, winnerPlayerId: 'p-1' },
        { gameNumber: 2, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'COMPLETED' as const, result: 'HOME_WIN' as const, winnerPlayerId: 'p-1' },
        { gameNumber: 3, homePlayerId: 'p-1', awayPlayerId: 'p-2', status: 'PENDING' as const, result: null, winnerPlayerId: null },
      ],
    };
    expect(resolveSeriesAdvancement(shared)).toMatchObject({
      state: 'PENDING',
      advancingPlayerId: null,
      eliminatedPlayerIds: [],
      audit: null,
    });

    const unresolved = resolveSeriesAdvancement({
      ...shared,
      games: [
        ...shared.games.slice(0, 2),
        { ...shared.games[2], status: 'COMPLETED' as const, result: 'UNRESOLVED' as const },
      ],
    });
    expect(unresolved).toMatchObject({
      state: 'ELIMINATED',
      advancingPlayerId: null,
      eliminatedPlayerIds: ['p-1', 'p-2'],
      reason: 'NO_VALID_OUTCOME',
      audit: { outcome: 'BOTH_ELIMINATED' },
    });

    const nonCanonicalScore = resolveSeriesAdvancement({
      ...shared,
      games: [
        ...shared.games.slice(0, 2),
        { ...shared.games[2], status: 'COMPLETED' as const, result: 'HOME_WIN' as const, winnerPlayerId: 'p-1' },
      ],
    });
    expect(nonCanonicalScore).toMatchObject({
      state: 'ELIMINATED',
      advancingPlayerId: null,
      eliminatedPlayerIds: ['p-1', 'p-2'],
      reason: 'NO_VALID_OUTCOME',
    });
  });

  it('transitions finalized winners into freshly distributed plots and is idempotently audited', () => {
    const createSeries = (id: string, homePlayerId: string, awayPlayerId: string, winner: string) => {
      const games = Array.from({ length: 3 }, (_, index) => ({
        gameNumber: index + 1,
        homePlayerId,
        awayPlayerId,
        status: 'COMPLETED' as const,
        result: (winner === homePlayerId
          ? index < 2 ? 'HOME_WIN' : 'AWAY_WIN'
          : index < 2 ? 'AWAY_WIN' : 'HOME_WIN') as 'HOME_WIN' | 'AWAY_WIN',
        winnerPlayerId: index < 2 ? winner : winner === homePlayerId ? awayPlayerId : homePlayerId,
      }));
      return {
        id,
        status: 'COMPLETED' as const,
        games,
        advancement: resolveSeriesAdvancement({ seriesId: id, games }),
      };
    };
    const input = {
      seasonId: 'season-1',
      seasonStart: '2027-01-01T00:00:00.000Z',
      seasonEnd: '2027-03-31T00:00:00.000Z',
      transitionAt: '2027-01-31T00:00:00.000Z',
      nextPhaseId: 'phase-2-id',
      actorId: 'admin-1',
      currentPhase: {
        id: 'phase-1-id',
        phaseNumber: 1,
        status: 'COMPLETED',
        endAt: '2027-01-30T00:00:00.000Z',
        plotCount: 2,
        previousPlots: [{ playerIds: ['p-1', 'p-2', 'p-3', 'p-4', 'stale-player'] }],
      },
      series: [
        createSeries('series-1', 'p-1', 'p-2', 'p-1'),
        createSeries('series-2', 'p-3', 'p-4', 'p-3'),
      ],
    };

    const transition = planPhaseTransition(input);
    expect(transition.advancementPool).toEqual(['p-1', 'p-3']);
    expect(transition.nextPhase.phaseNumber).toBe(2);
    expect(transition.nextPhase.participatingPlayerIds).toEqual(['p-1', 'p-3']);
    expect(transition.plots.flatMap((plot) => plot.playerIds)).toEqual(['p-1', 'p-3']);
    expect(transition.plots[0].phaseId).toBe('phase-2-id');
    expect(transition.series).toHaveLength(1);
    expect(transition.series[0].games).toHaveLength(3);
    expect(transition.audit).toMatchObject({
      action: 'PHASE_TRANSITIONED',
      fromPhaseId: 'phase-1-id',
      toPhaseId: 'phase-2-id',
      actorId: 'admin-1',
    });
    expect(planPhaseTransition(input)).toEqual(transition);
  });

  it('blocks incomplete phase transitions and rejects a next phase that cannot fit the season', () => {
    const finalizedSeries = {
      id: 'series-1',
      status: 'COMPLETED' as const,
      games: Array.from({ length: 3 }, (_, index) => ({
        gameNumber: index + 1,
        homePlayerId: 'p-1',
        awayPlayerId: 'p-2',
        status: 'COMPLETED' as const,
        result: index < 2 ? 'HOME_WIN' as const : 'AWAY_WIN' as const,
        winnerPlayerId: index < 2 ? 'p-1' : 'p-2',
      })),
    };
    const series = {
      ...finalizedSeries,
      advancement: resolveSeriesAdvancement({ seriesId: finalizedSeries.id, games: finalizedSeries.games }),
    };
    const secondGames = finalizedSeries.games.map((game) => ({
      ...game,
      homePlayerId: 'p-3',
      awayPlayerId: 'p-4',
      winnerPlayerId: game.result === 'HOME_WIN' ? 'p-3' : 'p-4',
    }));
    const secondSeries = {
      ...finalizedSeries,
      id: 'series-2',
      games: secondGames,
      advancement: resolveSeriesAdvancement({ seriesId: 'series-2', games: secondGames }),
    };
    const base = {
      seasonId: 'season-1',
      seasonStart: '2027-01-01T00:00:00.000Z',
      seasonEnd: '2027-03-31T00:00:00.000Z',
      transitionAt: '2027-01-31T00:00:00.000Z',
      nextPhaseId: 'phase-2-id',
      currentPhase: { id: 'phase-1-id', phaseNumber: 1, status: 'COMPLETED', endAt: null, plotCount: 1 },
      series: [series, secondSeries],
    };

    expect(() => planPhaseTransition({
      ...base,
      currentPhase: { ...base.currentPhase, status: 'IN_PROGRESS' },
    })).toThrow('Current phase must be completed');
    expect(() => planPhaseTransition({ ...base, series: [series] }))
      .toThrow('At least two survivors are required to generate a next phase');
    expect(() => planPhaseTransition({
      ...base,
      seasonEnd: '2027-02-05T00:00:00.000Z',
    })).toThrow('cannot accommodate the required competition');
  });

  it('calculates phase-scoped records and excludes all eliminated players from survivors', () => {
    const progression = calculatePhaseProgression({
      phaseStatus: 'COMPLETED',
      participantIds: ['p-1', 'p-2', 'p-3', 'p-4'],
      plots: [
        { id: 'plot-1', name: 'Plot 1', playerIds: ['p-1', 'p-2'] },
        { id: 'plot-2', name: 'Plot 2', playerIds: ['p-3', 'p-4'] },
      ],
      series: [
        {
          id: 'series-win',
          status: 'COMPLETED',
          playerIds: ['p-1', 'p-2'],
          winnerPlayerId: 'p-1',
          eliminatedPlayerIds: [],
          games: [{ status: 'COMPLETED', result: 'HOME_WIN' }, { status: 'COMPLETED', result: 'HOME_WIN' }, { status: 'COMPLETED', result: 'AWAY_WIN' }],
        },
        {
          id: 'series-draw',
          status: 'ELIMINATED',
          playerIds: ['p-3', 'p-4'],
          winnerPlayerId: null,
          eliminatedPlayerIds: ['p-3', 'p-4'],
          games: [{ status: 'COMPLETED', result: 'DRAW' }, { status: 'COMPLETED', result: 'HOME_WIN' }, { status: 'COMPLETED', result: 'AWAY_WIN' }],
        },
      ],
    });

    expect(progression).toMatchObject({
      phaseFinalized: true,
      participantCount: 4,
      playedSeriesCount: 2,
      pendingSeriesCount: 0,
      gamesPlayedCount: 6,
      survivors: ['p-1'],
      advancementEligiblePlayerIds: ['p-1'],
    });
    expect(progression.participants).toMatchObject([
      { playerId: 'p-1', plotIds: ['plot-1'], seriesPlayed: 1, gamesPlayed: 3, seriesWins: 1, seriesLosses: 0, eliminations: 0, survivor: true, advancementEligible: true },
      { playerId: 'p-2', plotIds: ['plot-1'], seriesPlayed: 1, seriesWins: 0, seriesLosses: 1, eliminations: 1, survivor: false, advancementEligible: false },
      { playerId: 'p-3', plotIds: ['plot-2'], seriesLosses: 1, eliminations: 1, survivor: false, advancementEligible: false },
      { playerId: 'p-4', plotIds: ['plot-2'], seriesLosses: 1, eliminations: 1, survivor: false, advancementEligible: false },
    ]);
  });

  it('does not expose survivors or advancement eligibility while a Phase or Series is pending', () => {
    const progression = calculatePhaseProgression({
      phaseStatus: 'COMPLETED',
      participantIds: ['p-1', 'p-2'],
      plots: [{ id: 'plot-1', name: 'Plot 1', playerIds: ['p-1', 'p-2'] }],
      series: [{
        id: 'series-pending',
        status: 'IN_PROGRESS',
        playerIds: ['p-1', 'p-2'],
        winnerPlayerId: null,
        eliminatedPlayerIds: [],
        games: [{ status: 'COMPLETED', result: 'HOME_WIN' }, { status: 'IN_PROGRESS', result: null }, { status: 'PENDING', result: null }],
      }],
    });

    expect(progression.phaseFinalized).toBe(false);
    expect(progression.pendingSeriesCount).toBe(1);
    expect(progression.gamesPlayedCount).toBe(1);
    expect(progression.survivors).toEqual([]);
    expect(progression.advancementEligiblePlayerIds).toEqual([]);
    expect(progression.participants.every((participant) => !participant.advancementEligible)).toBe(true);

    const activePhase = calculatePhaseProgression({
      phaseStatus: 'ACTIVE',
      participantIds: ['p-1', 'p-2'],
      plots: [{ id: 'plot-1', name: 'Plot 1', playerIds: ['p-1', 'p-2'] }],
      series: [{
        id: 'series-finalized',
        status: 'COMPLETED',
        playerIds: ['p-1', 'p-2'],
        winnerPlayerId: 'p-1',
        eliminatedPlayerIds: ['p-2'],
        games: [
          { status: 'COMPLETED', result: 'HOME_WIN' },
          { status: 'COMPLETED', result: 'HOME_WIN' },
          { status: 'COMPLETED', result: 'AWAY_WIN' },
        ],
      }],
    });
    expect(activePhase.phaseFinalized).toBe(false);
    expect(activePhase.survivors).toEqual([]);
    expect(activePhase.advancementEligiblePlayerIds).toEqual([]);
  });

  it('does not finalize advancement when a Phase participant has no resolved Series', () => {
    const progression = calculatePhaseProgression({
      phaseStatus: 'COMPLETED',
      participantIds: ['p-1', 'p-2', 'p-3'],
      plots: [{ id: 'plot-1', name: 'Plot 1', playerIds: ['p-1', 'p-2'] }],
      series: [{
        id: 'series-only-pair',
        status: 'COMPLETED',
        playerIds: ['p-1', 'p-2'],
        winnerPlayerId: 'p-1',
        eliminatedPlayerIds: ['p-2'],
        games: [
          { status: 'COMPLETED', result: 'HOME_WIN' },
          { status: 'COMPLETED', result: 'HOME_WIN' },
          { status: 'COMPLETED', result: 'AWAY_WIN' },
        ],
      }],
    });

    expect(progression.phaseFinalized).toBe(false);
    expect(progression.survivors).toEqual([]);
    expect(progression.advancementEligiblePlayerIds).toEqual([]);
  });

  it('schedules Series in one-hour local windows and prevents participant overlap', () => {
    const input = {
      competitionTimezone: 'UTC',
      seasonStartAt: '2027-01-04T10:00:00.000Z',
      seasonEndAt: '2027-01-04T14:00:00.000Z',
      currentDate: '2027-01-04T00:00:00.000Z',
      phases: [{ id: 'phase-1', startAt: '2027-01-04T10:00:00.000Z', endAt: '2027-01-04T14:00:00.000Z' }],
      series: [
        { id: 'series-b', phaseId: 'phase-1', playerIds: ['p-1', 'p-2'] },
        { id: 'series-a', phaseId: 'phase-1', playerIds: ['p-1', 'p-3'] },
        { id: 'series-c', phaseId: 'phase-1', playerIds: ['p-4', 'p-5'] },
      ],
      existingAppointments: [{
        seriesId: 'existing-series',
        playerIds: ['p-4', 'p-5'],
        matchWindowStartAt: '2027-01-04T10:00:00.000Z',
        matchWindowEndAt: '2027-01-04T11:00:00.000Z',
      }],
    };
    const result = scheduleSeriesAutomatically(input);

    expect(result.feasible).toBe(true);
    expect(result.scheduledSeries.map((appointment) => appointment.seriesId)).toEqual(['series-a', 'series-b', 'series-c']);
    expect(result.scheduledSeries[0]).toMatchObject({
      checkInOpensAt: '2027-01-04T10:00:00.000Z',
      checkInClosesAt: '2027-01-04T10:30:00.000Z',
      matchWindowStartAt: '2027-01-04T11:00:00.000Z',
      matchWindowEndAt: '2027-01-04T12:00:00.000Z',
      resultsDeadlineAt: '2027-01-04T12:30:00.000Z',
      timezone: 'UTC',
    });
    expect(result.scheduledSeries[1].matchWindowStartAt).toBe('2027-01-04T12:00:00.000Z');
    expect(result.scheduledSeries[2].matchWindowStartAt).toBe('2027-01-04T13:00:00.000Z');
    expect(result.scheduledSeries[0].seriesId).toBe('series-a');
    expect(scheduleSeriesAutomatically(input)).toEqual(result);

    const latestSlot = scheduleSeriesAutomatically({
      competitionTimezone: 'UTC',
      seasonStartAt: '2027-01-04T21:00:00.000Z',
      seasonEndAt: '2027-01-04T22:00:00.000Z',
      phases: [{ id: 'phase-late', startAt: '2027-01-04T21:00:00.000Z', endAt: '2027-01-04T22:00:00.000Z' }],
      series: [{ id: 'series-late', phaseId: 'phase-late', playerIds: ['p-6', 'p-7'] }],
    });
    expect(latestSlot.scheduledSeries[0].matchWindowStartAt).toBe('2027-01-04T21:00:00.000Z');
    expect(latestSlot.scheduledSeries[0].matchWindowEndAt).toBe('2027-01-04T22:00:00.000Z');
  });

  it('uses local timezone days/hours and excludes Sunday from automatic scheduling', () => {
    const result = scheduleSeriesAutomatically({
      competitionTimezone: 'America/New_York',
      seasonStartAt: '2027-01-10T05:00:00.000Z',
      seasonEndAt: '2027-01-12T00:00:00.000Z',
      currentDate: '2027-01-10T05:00:00.000Z',
      phases: [{ id: 'phase-weekend', phaseNumber: 1, startAt: '2027-01-10T05:00:00.000Z', endAt: '2027-01-12T00:00:00.000Z' }],
      series: [{ id: 'series-weekend', phaseId: 'phase-weekend', playerIds: ['p-1', 'p-2'] }],
    });

    expect(result.feasible).toBe(true);
    expect(result.scheduledSeries).toHaveLength(1);
    const scheduled = result.scheduledSeries[0];
    const localStart = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
    }).format(new Date(scheduled.matchWindowStartAt));
    expect(localStart).toMatch(/Monday.*10:00/);
    expect(scheduled.matchWindowEndAt).toBe('2027-01-11T16:00:00.000Z');
  });

  it('blocks automatic scheduling before appointments are generated when season capacity is insufficient', () => {
    const result = scheduleSeriesAutomatically({
      competitionTimezone: 'UTC',
      seasonStartAt: '2027-01-01T00:00:00.000Z',
      seasonEndAt: '2027-02-01T00:00:00.000Z',
      currentDate: '2027-01-28T00:00:00.000Z',
      currentPhaseNumber: 0,
      phases: [
        { id: 'phase-1', phaseNumber: 1, startAt: '2027-01-04T00:00:00.000Z', endAt: '2027-01-25T00:00:00.000Z' },
        { id: 'phase-2', phaseNumber: 2, startAt: '2027-01-25T00:00:00.000Z', endAt: '2027-02-01T00:00:00.000Z' },
      ],
      series: [
        { id: 'series-late', phaseId: 'phase-1', playerIds: ['p-1', 'p-2'] },
        { id: 'series-final', phaseId: 'phase-2', playerIds: ['p-3', 'p-4'] },
      ],
    });

    expect(result.feasible).toBe(false);
    expect(result.scheduledSeries).toEqual([]);
    expect(result.unscheduledSeries).toEqual([
      { seriesId: 'series-final', reason: 'CAPACITY_INSUFFICIENT' },
      { seriesId: 'series-late', reason: 'CAPACITY_INSUFFICIENT' },
    ]);
    expect(result.capacity.blockers.length).toBeGreaterThan(0);
  });

  it('derives operational states at the exact check-in, match, and results boundaries', () => {
    const appointment = {
      seriesId: 'series-1',
      phaseId: 'phase-1',
      playerIds: ['p-1', 'p-2'],
      scheduleKey: 'series-1:automatic-series-window',
      checkInOpensAt: '2027-01-04T09:00:00.000Z',
      checkInClosesAt: '2027-01-04T09:30:00.000Z',
      matchWindowStartAt: '2027-01-04T10:00:00.000Z',
      matchWindowEndAt: '2027-01-04T11:00:00.000Z',
      resultsDeadlineAt: '2027-01-04T11:30:00.000Z',
      timezone: 'UTC',
      gameNumbers: [1, 2, 3] as [1, 2, 3],
    };

    expect(deriveSeriesOperationalState(appointment, '2027-01-04T08:59:59.999Z')).toMatchObject({
      checkIn: 'NOT_OPEN',
      matchWindow: 'UPCOMING',
      results: 'NOT_OPEN',
    });
    expect(deriveSeriesOperationalState(appointment, '2027-01-04T09:00:00.000Z').checkIn).toBe('OPEN');
    expect(deriveSeriesOperationalState(appointment, '2027-01-04T09:30:00.000Z').checkIn).toBe('CLOSED');
    expect(deriveSeriesOperationalState(appointment, '2027-01-04T10:00:00.000Z')).toMatchObject({
      matchWindow: 'ACTIVE',
      results: 'OPEN',
    });
    expect(deriveSeriesOperationalState(appointment, '2027-01-04T11:00:00.000Z')).toMatchObject({
      matchWindow: 'CLOSED',
      results: 'OPEN',
    });
    expect(deriveSeriesOperationalState(appointment, '2027-01-04T11:30:00.000Z').results).toBe('CLOSED');
  });

  it('rejects early/late operations and games outside their active Series window', () => {
    const appointment = {
      seriesId: 'series-1',
      phaseId: 'phase-1',
      playerIds: ['p-1', 'p-2'],
      scheduleKey: 'series-1:automatic-series-window',
      checkInOpensAt: '2027-01-04T09:00:00.000Z',
      checkInClosesAt: '2027-01-04T09:30:00.000Z',
      matchWindowStartAt: '2027-01-04T10:00:00.000Z',
      matchWindowEndAt: '2027-01-04T11:00:00.000Z',
      resultsDeadlineAt: '2027-01-04T11:30:00.000Z',
      timezone: 'UTC',
      gameNumbers: [1, 2, 3] as [1, 2, 3],
    };

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2027-01-04T08:59:59.999Z'));
      expect(() => assertCheckInAllowed(appointment)).toThrow('not open');
      vi.setSystemTime(new Date('2027-01-04T09:30:00.000Z'));
      expect(() => assertCheckInAllowed(appointment)).toThrow('closed');
      vi.setSystemTime(new Date('2027-01-04T09:59:59.999Z'));
      expect(() => assertGameInActiveSeriesWindow({
        appointment,
        activeSeriesId: 'series-1',
        game: { id: 'game-1', seriesId: 'series-1', gameNumber: 1 },
      })).toThrow('active Series Match Window');
      vi.setSystemTime(new Date('2027-01-04T10:30:00.000Z'));
      expect(() => assertGameInActiveSeriesWindow({
        appointment,
        activeSeriesId: 'series-2',
        game: { id: 'game-1', seriesId: 'series-1', gameNumber: 1 },
      })).toThrow('does not belong to the active Series');
      expect(assertGameInActiveSeriesWindow({
        appointment,
        activeSeriesId: 'series-1',
        game: { id: 'game-1', seriesId: 'series-1', gameNumber: 1 },
      })).toBe(true);
      vi.setSystemTime(new Date('2027-01-04T11:29:59.999Z'));
      expect(assertSeriesResultSubmissionAllowed(appointment)).toBe(true);
      vi.setSystemTime(new Date('2027-01-04T09:59:59.999Z'));
      expect(() => assertSeriesResultSubmissionAllowed(appointment)).toThrow('not open');
      vi.setSystemTime(new Date('2027-01-04T11:30:00.000Z'));
      expect(() => assertSeriesResultSubmissionAllowed(appointment)).toThrow('closed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires both checked-in participants and the active Match Window before Series execution', () => {
    const window = {
      matchWindowStartAt: '2027-01-04T10:00:00.000Z',
      matchWindowEndAt: '2027-01-04T11:00:00.000Z',
      serverTime: '2027-01-04T10:15:00.000Z',
    };
    const input = {
      status: 'SCHEDULED',
      attendancePolicy: 'BOTH_PARTICIPANTS_REQUIRED',
      participantIds: ['p-1', 'p-2'],
      checkedInPlayerIds: ['p-1', 'p-2'],
      ...window,
    };

    expect(assertSeriesCanStart(input)).toBe(true);
    expect(() => assertSeriesCanStart({ ...input, checkedInPlayerIds: ['p-1'] }))
      .toThrow('Both participants must check in');
    expect(() => assertSeriesCanStart({ ...input, serverTime: '2027-01-04T09:59:59.999Z' }))
      .toThrow('active Match Window');
    expect(() => assertSeriesCanStart({ ...input, serverTime: '2027-01-04T11:00:00.000Z' }))
      .toThrow('active Match Window');
    expect(() => assertSeriesCanStart({ ...input, status: 'IN_PROGRESS' }))
      .toThrow('Only a scheduled Series can start');
  });

  it('validates complete Series schedules deterministically and gates schedule locking', () => {
    const input = {
      automatic: true,
      competitionTimezone: 'UTC',
      seasonStartAt: '2027-01-04T10:00:00.000Z',
      seasonEndAt: '2027-01-04T14:00:00.000Z',
      phases: [{ id: 'phase-1', startAt: '2027-01-04T10:00:00.000Z', endAt: '2027-01-04T14:00:00.000Z' }],
      series: [
        { id: 'series-1', phaseId: 'phase-1', playerIds: ['p-1', 'p-2'] },
        { id: 'series-2', phaseId: 'phase-1', playerIds: ['p-3', 'p-4'] },
      ],
      appointments: [
        {
          seriesId: 'series-1', phaseId: 'phase-1', playerIds: ['p-1', 'p-2'], scheduleKey: 's1',
          checkInOpensAt: '2027-01-04T09:00:00.000Z', checkInClosesAt: '2027-01-04T09:30:00.000Z',
          matchWindowStartAt: '2027-01-04T10:00:00.000Z', matchWindowEndAt: '2027-01-04T11:00:00.000Z',
          resultsDeadlineAt: '2027-01-04T11:30:00.000Z', timezone: 'UTC', gameNumbers: [1, 2, 3] as [1, 2, 3],
        },
        {
          seriesId: 'series-2', phaseId: 'phase-1', playerIds: ['p-3', 'p-4'], scheduleKey: 's2',
          checkInOpensAt: '2027-01-04T10:00:00.000Z', checkInClosesAt: '2027-01-04T10:30:00.000Z',
          matchWindowStartAt: '2027-01-04T11:00:00.000Z', matchWindowEndAt: '2027-01-04T12:00:00.000Z',
          resultsDeadlineAt: '2027-01-04T12:30:00.000Z', timezone: 'UTC', gameNumbers: [1, 2, 3] as [1, 2, 3],
        },
      ],
    };
    const report = validateSeriesSchedule(input);
    expect(report).toMatchObject({ valid: true, canLock: true, errors: [], blockers: [], warnings: [] });
    expect(validateSeriesSchedule(input)).toEqual(report);
    expect(assertSeriesScheduleCanLock(report)).toBe(true);
  });

  it('identifies actionable hard errors for invalid or incomplete Series appointments', () => {
    const input = {
      automatic: true,
      competitionTimezone: 'UTC',
      seasonStartAt: '2027-01-04T10:00:00.000Z',
      seasonEndAt: '2027-01-04T14:00:00.000Z',
      phases: [{ id: 'phase-1', startAt: '2027-01-04T10:00:00.000Z', endAt: '2027-01-04T14:00:00.000Z' }],
      series: [{ id: 'series-1', phaseId: 'phase-1', playerIds: ['p-1', 'p-2'] }],
      appointments: [{
        seriesId: 'series-1', phaseId: 'phase-1', playerIds: ['p-1', 'p-2'], scheduleKey: 's1',
        checkInOpensAt: '2027-01-04T09:00:00.000Z', checkInClosesAt: '2027-01-04T09:30:00.000Z',
        matchWindowStartAt: '2027-01-04T10:00:00.000Z', matchWindowEndAt: '2027-01-04T11:00:00.000Z',
        resultsDeadlineAt: '2027-01-04T11:30:00.000Z', timezone: 'UTC', gameNumbers: [1, 2, 3] as [1, 2, 3],
      }],
    };
    const codes = (override: Partial<typeof input>) => validateSeriesSchedule({ ...input, ...override }).errors.map((error) => error.code);

    expect(codes({ appointments: [] })).toContain('INCOMPLETE_SERIES_SCHEDULE');
    expect(codes({ appointments: [...input.appointments, input.appointments[0]] })).toContain('DUPLICATE_APPOINTMENT');
    expect(codes({ appointments: [{ ...input.appointments[0], phaseId: 'other-phase' }] })).toContain('WRONG_PHASE_ASSIGNMENT');
    expect(codes({ appointments: [{ ...input.appointments[0], playerIds: ['p-2', 'p-3'] }] })).toContain('PARTICIPANT_MISMATCH');
    expect(codes({ appointments: [{ ...input.appointments[0], timezone: 'Mars/Olympus' }] })).toContain('INVALID_TIMEZONE');
    expect(codes({ appointments: [{ ...input.appointments[0], timezone: 'America/New_York' }] })).toContain('TIMEZONE_MISMATCH');
    expect(codes({ appointments: [{ ...input.appointments[0], checkInClosesAt: '2027-01-04T09:20:00.000Z' }] }))
      .toContain('INVALID_CHECK_IN_WINDOW');
    expect(codes({ appointments: [{ ...input.appointments[0], resultsDeadlineAt: '2027-01-04T11:20:00.000Z' }] }))
      .toContain('INVALID_RESULTS_DEADLINE');
    expect(codes({ appointments: [{ ...input.appointments[0], matchWindowStartAt: '2027-01-04T09:00:00.000Z' }] }))
      .toContain('INVALID_MATCH_WINDOW');
    expect(codes({ appointments: [{ ...input.appointments[0], matchWindowStartAt: '2027-01-04T14:00:00.000Z', matchWindowEndAt: '2027-01-04T15:00:00.000Z' }] }))
      .toContain('OUTSIDE_SEASON_BOUNDARIES');
    expect(codes({
      phases: [{ id: 'phase-1', startAt: '2027-01-04T11:00:00.000Z', endAt: '2027-01-04T14:00:00.000Z' }],
    })).toContain('OUTSIDE_PHASE_BOUNDARIES');
    expect(codes({ appointments: [{ ...input.appointments[0], matchWindowStartAt: '2027-01-10T10:00:00.000Z', matchWindowEndAt: '2027-01-10T11:00:00.000Z' }] }))
      .toContain('SUNDAY_AUTOMATIC_SCHEDULE');
    expect(codes({ series: [{ ...input.series[0], phaseId: 'other-phase' }] }))
      .toContain('WRONG_PHASE_ASSIGNMENT');
  });

  it('detects overlapping Series and participant double-booking, and revalidates manual adjustments', () => {
    const input = {
      automatic: false,
      competitionTimezone: 'UTC',
      seasonStartAt: '2027-01-04T10:00:00.000Z',
      seasonEndAt: '2027-01-04T14:00:00.000Z',
      phases: [{ id: 'phase-1', startAt: '2027-01-04T10:00:00.000Z', endAt: '2027-01-04T14:00:00.000Z' }],
      series: [
        { id: 'series-1', phaseId: 'phase-1', playerIds: ['p-1', 'p-2'] },
        { id: 'series-2', phaseId: 'phase-1', playerIds: ['p-2', 'p-3'] },
      ],
      appointments: [
        {
          seriesId: 'series-1', phaseId: 'phase-1', playerIds: ['p-1', 'p-2'], scheduleKey: 's1',
          checkInOpensAt: '2027-01-04T09:00:00.000Z', checkInClosesAt: '2027-01-04T09:30:00.000Z',
          matchWindowStartAt: '2027-01-04T10:00:00.000Z', matchWindowEndAt: '2027-01-04T11:00:00.000Z',
          resultsDeadlineAt: '2027-01-04T11:30:00.000Z', timezone: 'UTC', gameNumbers: [1, 2, 3] as [1, 2, 3],
        },
        {
          seriesId: 'series-2', phaseId: 'phase-1', playerIds: ['p-2', 'p-3'], scheduleKey: 's2',
          checkInOpensAt: '2027-01-04T09:30:00.000Z', checkInClosesAt: '2027-01-04T10:00:00.000Z',
          matchWindowStartAt: '2027-01-04T10:30:00.000Z', matchWindowEndAt: '2027-01-04T11:30:00.000Z',
          resultsDeadlineAt: '2027-01-04T12:00:00.000Z', timezone: 'UTC', gameNumbers: [1, 2, 3] as [1, 2, 3],
        },
      ],
    };
    const report = validateSeriesSchedule(input);
    expect(report.errors.map((error) => error.code)).toContain('OVERLAPPING_SERIES');
    expect(report.errors.map((error) => error.code)).toContain('PARTICIPANT_DOUBLE_BOOKING');
    expect(() => assertSeriesScheduleCanLock(report)).toThrow('cannot be locked');

    const adjusted = adjustSeriesAppointment({ input, seriesId: 'series-2', matchWindowStartAt: '2027-01-04T11:00:00.000Z' });
    expect(adjusted.appointment.seriesId).toBe('series-2');
    expect(adjusted.appointment.matchWindowStartAt).toBe('2027-01-04T11:00:00.000Z');
    expect(adjusted.validation.canLock).toBe(true);
  });

  it('derives phase duration from Series workload and reserves the final week', () => {
    const capacity = calculateSeasonCapacity({
      seasonStartAt: '2027-01-04T00:00:00.000Z',
      seasonEndAt: '2027-03-31T22:00:00.000Z',
      currentDate: '2027-01-04T00:00:00.000Z',
      competitionTimezone: 'UTC',
      currentPhaseNumber: 0,
      remainingPhases: [
        {
          phaseNumber: 1,
          seriesCount: 24,
          participantIdsBySeries: Array.from({ length: 24 }, (_, index) => index === 0
            ? ['p-1', 'p-2']
            : index === 1 ? ['p-1', 'p-3'] : [`p-${index * 2}`, `p-${index * 2 + 1}`]),
        },
        { phaseNumber: 2, seriesCount: 6 },
        { phaseNumber: 3, seriesCount: 3 },
      ],
      requiredTransitionHours: 24,
    });

    expect(capacity.feasible).toBe(true);
    expect(capacity.phases[0].durationMs).toBeGreaterThan(capacity.phases[1].durationMs);
    expect(Date.parse(capacity.phases.at(-1)?.startAt ?? ''))
      .toBeGreaterThanOrEqual(Date.parse('2027-03-24T22:00:00.000Z'));
    expect(capacity.phases[0].participantConflictCount).toBe(1);
    expect(capacity.requiredTransitionHours).toBe(48);
  });

  it('blocks insufficient remaining capacity and handles 100, 500, and 1000-player workloads', () => {
    const workloads = [100, 500, 1000].map((playerCount) => ({
      playerCount,
      seriesCounts: estimateSeriesCountsForPlayerField(playerCount),
    }));
    expect(workloads.map(({ seriesCounts }) => seriesCounts[0].seriesCount)).toEqual([950, 12250, 49500]);
    expect(workloads[0].seriesCounts[0].seriesCount).toBeLessThan(workloads[1].seriesCounts[0].seriesCount);
    expect(workloads[1].seriesCounts[0].seriesCount).toBeLessThan(workloads[2].seriesCounts[0].seriesCount);

    const plans = workloads.map(({ seriesCounts }) => calculateSeasonCapacity({
      seasonStartAt: '2027-01-04T00:00:00.000Z',
      seasonEndAt: '2027-02-03T00:00:00.000Z',
      currentDate: '2027-01-04T00:00:00.000Z',
      competitionTimezone: 'UTC',
      currentPhaseNumber: 0,
      remainingPhases: seriesCounts,
    }));
    expect(plans.every((plan) => !plan.feasible && plan.blockers.length > 0)).toBe(true);

    const alreadyLate = calculateSeasonCapacity({
      seasonStartAt: '2027-01-01T00:00:00.000Z',
      seasonEndAt: '2027-02-01T00:00:00.000Z',
      currentDate: '2027-01-31T00:00:00.000Z',
      competitionTimezone: 'UTC',
      currentPhaseNumber: 1,
      remainingPhases: [{ phaseNumber: 2, seriesCount: 10 }],
    });
    expect(alreadyLate.feasible).toBe(false);
  });

  it('validates every ruleset area and renders player-facing rules from its active version', () => {
    const validated = validateCompetitionRules(DEFAULT_COMPETITION_RULES);
    expect(Object.keys(validated)).toEqual([
      'competitionStructure', 'phasePlotRules', 'seriesGameRules', 'drawRules', 'advancement',
      'scheduling', 'checkIn', 'results', 'disputes', 'penalties', 'conduct', 'participation', 'paymentFees',
    ]);
    const rendered = buildPlayerFacingRules(validated, { name: 'Standard Competition', version: '2.1.0' });
    expect(rendered.version).toBe('2.1.0');
    expect(rendered.sections.map((section) => section.title)).toContain('Disputes');
    expect(rendered.sections.map((section) => section.title)).toContain('Payment and fees');
    expect(rendered.text).toContain('3 Games');
    expect(rendered.text).toContain('opens 60 minutes before');
    expect(rendered.text).toContain('draw eliminates both participants');
  });

  it('rejects noncanonical result, draw, check-in, and scheduling rules', () => {
    expect(() => validateCompetitionRules({
      ...DEFAULT_COMPETITION_RULES,
      seriesGameRules: { ...DEFAULT_COMPETITION_RULES.seriesGameRules, gamesPerSeries: 5 },
    })).toThrow('exactly three Games');
    expect(() => validateCompetitionRules({
      ...DEFAULT_COMPETITION_RULES,
      drawRules: { ...DEFAULT_COMPETITION_RULES.drawRules, anyGameDraw: 'WIN_COUNT_STANDS' },
    })).toThrow('draw must eliminate both participants');
    expect(() => validateCompetitionRules({
      ...DEFAULT_COMPETITION_RULES,
      checkIn: { ...DEFAULT_COMPETITION_RULES.checkIn, opensMinutesBefore: 30 },
    })).toThrow('Check-in must open at T-60');
    expect(validateCompetitionRules({
      ...DEFAULT_COMPETITION_RULES,
      checkIn: { opensMinutesBefore: 60, closesMinutesBefore: 30 },
    }).checkIn.attendancePolicy).toBe('BOTH_PARTICIPANTS_REQUIRED');
    expect(() => validateCompetitionRules({
      ...DEFAULT_COMPETITION_RULES,
      checkIn: { ...DEFAULT_COMPETITION_RULES.checkIn, attendancePolicy: 'ONE_PARTICIPANT_REQUIRED' },
    })).toThrow('both participants to check in');
    expect(() => validateCompetitionRules({
      ...DEFAULT_COMPETITION_RULES,
      scheduling: { ...DEFAULT_COMPETITION_RULES.scheduling, latestStartLocal: '22:00' },
    })).toThrow('latest automatic Series start must be 21:00');
  });
});
