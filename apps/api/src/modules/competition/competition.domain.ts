export const DEFAULT_COMPETITION_TIMEZONE = 'UTC';
export const SERIES_GAME_COUNT = 3;
export const SERIES_MATCH_WINDOW_START = '10:00';
export const SERIES_MATCH_WINDOW_END = '22:00';

export const COMPETITION_RULE_AREAS = [
  'competitionStructure',
  'phasePlotRules',
  'seriesGameRules',
  'drawRules',
  'advancement',
  'scheduling',
  'checkIn',
  'results',
  'disputes',
  'penalties',
  'conduct',
  'participation',
  'paymentFees',
] as const;

export type CompetitionRuleArea = typeof COMPETITION_RULE_AREAS[number];
export type CompetitionRulesDocument = Record<CompetitionRuleArea, Record<string, unknown>>;

export const DEFAULT_COMPETITION_RULES: CompetitionRulesDocument = {
  competitionStructure: { hierarchy: 'Season > Phase > Plot > Series > Game' },
  phasePlotRules: { finalPhaseProtectionDays: 7, maximumPlots: 10, targetParticipantsPerPlot: 20 },
  seriesGameRules: { gamesPerSeries: 3, matchWindowMinutes: 60 },
  drawRules: { anyGameDraw: 'BOTH_ELIMINATED' },
  advancement: { normalSeriesResult: 'BEST_OF_THREE_TWO_WINS', unresolvedSeries: 'BOTH_ELIMINATED' },
  scheduling: {
    automaticDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
    firstStartLocal: '10:00', latestStartLocal: '21:00', matchWindowEndLocal: '22:00', timezonePolicy: 'SEASON',
  },
  checkIn: {
    opensMinutesBefore: 60,
    closesMinutesBefore: 30,
    attendancePolicy: 'BOTH_PARTICIPANTS_REQUIRED',
  },
  results: { deadlineMinutesAfterStart: 90 },
  disputes: { enabled: true, submissionWindowHours: 24, reviewRequired: true },
  penalties: { enabled: true, requireReason: true, appealWindowHours: 48 },
  conduct: { codeOfConductRequired: true, sportsmanshipPolicy: 'STANDARD' },
  participation: { eligibilityRequired: true, rosterLocksBeforeSchedule: true, substitutesAllowed: false },
  paymentFees: { applicable: false, currency: null, entryFeeMinorUnits: 0, refundPolicy: 'NOT_APPLICABLE' },
};

const COMPETITION_RULE_TITLES: Record<CompetitionRuleArea, string> = {
  competitionStructure: 'Competition structure',
  phasePlotRules: 'Phase and Plot rules',
  seriesGameRules: 'Series and Game rules',
  drawRules: 'Draw rules',
  advancement: 'Advancement',
  scheduling: 'Scheduling',
  checkIn: 'Check-in',
  results: 'Results',
  disputes: 'Disputes',
  penalties: 'Penalties',
  conduct: 'Conduct',
  participation: 'Participation',
  paymentFees: 'Payment and fees',
};

export function validateCompetitionRules(value: unknown): CompetitionRulesDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Competition rules must be a structured object.');
  }
  const input = value as Record<string, unknown>;
  const missingAreas = COMPETITION_RULE_AREAS.filter((area) =>
    !input[area] || typeof input[area] !== 'object' || Array.isArray(input[area]));
  if (missingAreas.length > 0) {
    throw new Error(`Competition rules are missing required sections: ${missingAreas.join(', ')}.`);
  }

  const rules = JSON.parse(JSON.stringify(input)) as CompetitionRulesDocument;
  if (rules.seriesGameRules.gamesPerSeries !== SERIES_GAME_COUNT) {
    throw new Error('A Series must contain exactly three Games.');
  }
  if (rules.drawRules.anyGameDraw !== 'BOTH_ELIMINATED') {
    throw new Error('A Game draw must eliminate both participants from the Series.');
  }
  if (rules.advancement.unresolvedSeries !== 'BOTH_ELIMINATED') {
    throw new Error('An unresolved Series must eliminate both participants.');
  }
  if (rules.checkIn.opensMinutesBefore !== 60 || rules.checkIn.closesMinutesBefore !== 30) {
    throw new Error('Check-in must open at T-60 and close at T-30.');
  }
  rules.checkIn.attendancePolicy ??= 'BOTH_PARTICIPANTS_REQUIRED';
  if (rules.checkIn.attendancePolicy !== 'BOTH_PARTICIPANTS_REQUIRED') {
    throw new Error('Series execution requires both participants to check in.');
  }
  if (rules.results.deadlineMinutesAfterStart !== 90) {
    throw new Error('Results deadline must be T+90.');
  }
  if (rules.scheduling.latestStartLocal !== '21:00' || rules.scheduling.matchWindowEndLocal !== '22:00') {
    throw new Error('The latest automatic Series start must be 21:00 with a 22:00 close.');
  }
  if (rules.scheduling.firstStartLocal !== '10:00' || rules.scheduling.timezonePolicy !== 'SEASON') {
    throw new Error('Automatic scheduling must start at 10:00 in the Season timezone.');
  }
  const allowedDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const automaticDays = rules.scheduling.automaticDays;
  if (!Array.isArray(automaticDays)
    || automaticDays.length !== allowedDays.length
    || allowedDays.some((day, index) => automaticDays[index] !== day)) {
    throw new Error('Automatic scheduling days must be Monday through Saturday with Sunday excluded.');
  }
  if (rules.phasePlotRules.finalPhaseProtectionDays !== 7) {
    throw new Error('The final seven days of the Season must be reserved for the Final Phase.');
  }
  return rules;
}

export interface PlayerFacingCompetitionRules {
  name: string;
  version: string;
  sections: Array<{ title: string; items: string[] }>;
  text: string;
}

function playerFacingValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item).replaceAll('_', ' ')).join(', ');
  if (value === null) return 'Not applicable';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value.replaceAll('_', ' ');
  return String(value);
}

export function buildPlayerFacingRules(
  rulesInput: CompetitionRulesDocument,
  version: { name: string; version: string },
): PlayerFacingCompetitionRules {
  const rules = validateCompetitionRules(rulesInput);
  const sections = COMPETITION_RULE_AREAS.map((area) => ({
    title: COMPETITION_RULE_TITLES[area],
    items: Object.entries(rules[area]).map(([key, value]) => {
      const label = key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase());
      return `${label}: ${playerFacingValue(value)}`;
    }),
  }));
  const text = [
    `# ${version.name} (version ${version.version})`,
    `Each Series contains exactly ${rules.seriesGameRules.gamesPerSeries} Games.`,
    `Check-in opens ${rules.checkIn.opensMinutesBefore} minutes before and closes ${rules.checkIn.closesMinutesBefore} minutes before the Match Window.`,
    'A Game draw eliminates both participants from the Series.',
    ...sections.map((section) => `## ${section.title}\n${section.items.map((item) => `- ${item}`).join('\n')}`),
  ].join('\n\n');
  return { name: version.name, version: version.version, sections, text };
}

export type CompetitionPhaseType = 'QUALIFYING' | 'PLAYOFF' | 'FINAL' | 'CUSTOM';
export type CompetitionSeriesStatus = 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'ELIMINATED' | 'DISPUTED';
export type CompetitionGameOutcome = 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' | 'UNRESOLVED';

export interface CompetitionRulesetReference {
  id?: string;
  name: string;
  version: string;
  description?: string | null;
}

export interface SeasonCompetitionConfig {
  timezone: string;
  registrationOpenAt?: Date | string | null;
  registrationCloseAt?: Date | string | null;
  ruleset?: CompetitionRulesetReference | null;
  competitionConfiguration?: Record<string, unknown> | null;
}

export interface CompetitionSeason {
  id?: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
  timezone: string;
  registrationOpenAt?: Date | string | null;
  registrationCloseAt?: Date | string | null;
  ruleset?: CompetitionRulesetReference | null;
  phaseCollection?: CompetitionPhase[];
}

export interface CompetitionPhase {
  id?: string;
  phaseNumber: number;
  phaseType: CompetitionPhaseType;
  name?: string | null;
  startDate: Date | string;
  endDate: Date | string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  participatingPlayers: string[];
  plotCollection?: CompetitionPlot[];
  configuration?: Record<string, unknown> | null;
}

export interface CompetitionPlot {
  id?: string;
  phaseId?: string;
  name?: string | null;
  playerIds: string[];
  status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  seriesCollection?: CompetitionSeries[];
}

export interface CompetitionSeries {
  id?: string;
  plotId?: string;
  seriesNumber?: number;
  status: CompetitionSeriesStatus;
  games: CompetitionGame[];
  matchWindow?: {
    startsAt?: Date | string | null;
    endsAt?: Date | string | null;
    timezone?: string | null;
  };
}

export interface CompetitionGame {
  id?: string;
  gameNumber: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  homePlayerId?: string | null;
  awayPlayerId?: string | null;
  winnerPlayerId?: string | null;
  result?: CompetitionGameOutcome | null;
}

export function validateSeasonWindow(
  seasonStart: Date | string,
  seasonEnd: Date | string,
  timezone: string,
): void {
  if (!timezone || !timezone.trim()) {
    throw new Error('Competition timezone is required');
  }

  const start = new Date(seasonStart);
  const end = new Date(seasonEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Season start and end dates must be valid Date values');
  }

  if (end <= start) {
    throw new Error('Season end date must be after the start date');
  }
}

export function validatePhaseWindow(
  phaseStart: Date | string,
  phaseEnd: Date | string,
  seasonStart: Date | string,
  seasonEnd: Date | string,
): void {
  validateSeasonWindow(seasonStart, seasonEnd, DEFAULT_COMPETITION_TIMEZONE);

  const start = new Date(phaseStart);
  const end = new Date(phaseEnd);
  const seasonBoundsStart = new Date(seasonStart);
  const seasonBoundsEnd = new Date(seasonEnd);

  if (start < seasonBoundsStart || end > seasonBoundsEnd) {
    throw new Error('Phase must fit within the season lifetime');
  }
}

export function validateFinalPhaseWindow(
  phaseStart: Date | string,
  phaseEnd: Date | string,
  seasonStart: Date | string,
  seasonEnd: Date | string,
): void {
  const seasonBoundsStart = new Date(seasonStart);
  const seasonBoundsEnd = new Date(seasonEnd);
  const finalWeekStart = new Date(seasonBoundsEnd);
  finalWeekStart.setUTCDate(finalWeekStart.getUTCDate() - 7);

  const start = new Date(phaseStart);
  const end = new Date(phaseEnd);

  if (end > seasonBoundsEnd || start < finalWeekStart) {
    throw new Error('Final phase must finish within the final week of the season');
  }
}

export function isAllowedSchedulingDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 6;
}

export function parseTimeToMinutes(value: string): number {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    throw new Error('Invalid time value');
  }

  const [, hoursText, minutesText] = match;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  return hours * 60 + minutes;
}

export function validateSeriesMatchWindow(window: {
  start: string;
  end: string;
  timezone: string;
}): void {
  if (!window.timezone || !window.timezone.trim()) {
    throw new Error('Competition timezone is required');
  }

  const startMinutes = parseTimeToMinutes(window.start);
  const endMinutes = parseTimeToMinutes(window.end);

  if (startMinutes < 10 * 60 || endMinutes > 22 * 60 || endMinutes <= startMinutes) {
    throw new Error('Series match window must fall within 10:00-22:00');
  }
}

export function createGameSlots(): CompetitionGame[] {
  return Array.from({ length: SERIES_GAME_COUNT }, (_, index) => ({
    gameNumber: index + 1,
    status: 'PENDING',
    result: null,
  }));
}

export function validateSeriesRules(series: CompetitionSeries): void {
  if (series.games.length !== SERIES_GAME_COUNT) {
    throw new Error(`A series must contain exactly ${SERIES_GAME_COUNT} games`);
  }

  const hasDraw = series.games.some((game) => game.result === 'DRAW');
  if (hasDraw) {
    throw new Error('A draw in any game eliminates both players from the series');
  }

  if (series.matchWindow) {
    validateSeriesMatchWindow({
      start: series.matchWindow.startsAt ? new Date(series.matchWindow.startsAt).toISOString().slice(11, 16) : SERIES_MATCH_WINDOW_START,
      end: series.matchWindow.endsAt ? new Date(series.matchWindow.endsAt).toISOString().slice(11, 16) : SERIES_MATCH_WINDOW_END,
      timezone: series.matchWindow.timezone ?? DEFAULT_COMPETITION_TIMEZONE,
    });
  }
}

export function createRulesetReference(name: string, version: string, description?: string | null): CompetitionRulesetReference {
  if (!name?.trim()) {
    throw new Error('Ruleset name is required');
  }
  if (!version?.trim()) {
    throw new Error('Ruleset version is required');
  }

  return { name, version, description: description ?? null };
}

export function calculateExpectedPhaseDepth(approvedFieldSize: number): number {
  if (!Number.isFinite(approvedFieldSize) || approvedFieldSize <= 0) {
    throw new Error('Approved field size must be greater than zero');
  }

  return Math.ceil(Math.log2(approvedFieldSize)) + 1;
}

export function derivePhaseCounts(
  approvedFieldSize: number,
  survivorCounts?: number[],
): number[] {
  if (!Number.isFinite(approvedFieldSize) || approvedFieldSize <= 0) {
    throw new Error('Approved field size must be greater than zero');
  }

  const counts = Array.isArray(survivorCounts) && survivorCounts.length > 0
    ? [...survivorCounts].filter((count) => Number.isFinite(count) && count > 0)
    : [];

  if (counts.length === 0) {
    const derived: number[] = [approvedFieldSize];
    let current = approvedFieldSize;
    while (current > 1) {
      const next = Math.max(1, Math.ceil(current / 2));
      derived.push(next);
      current = next;
      if (next === 1) break;
    }
    return derived;
  }

  const normalized = [Math.max(1, counts[0])];
  const firstSurvivor = counts[0];
  if (firstSurvivor !== approvedFieldSize) {
    normalized[0] = approvedFieldSize;
  }

  for (let index = 1; index < counts.length; index += 1) {
    const count = Math.max(1, counts[index]);
    normalized.push(count);
  }

  if (normalized[normalized.length - 1] !== 1) {
    let current = normalized[normalized.length - 1];
    while (current > 1) {
      const next = Math.max(1, Math.ceil(current / 2));
      normalized.push(next);
      current = next;
      if (next === 1) break;
    }
  }

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] > normalized[index - 1]) {
      throw new Error('Survivor counts must decrease across phases');
    }
  }

  return normalized;
}

export interface PhaseSequenceInput {
  approvedFieldSize: number;
  survivorCounts?: number[];
  seasonStart: Date | string;
  seasonEnd: Date | string;
  finalWeekProtectionDays?: number;
}

export interface GeneratedPhase {
  phaseNumber: number;
  playerCount: number;
  startDate: Date | string;
  endDate: Date | string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  isFinalPhase: boolean;
  durationMs: number;
}

export function buildPhaseSequence(input: PhaseSequenceInput): GeneratedPhase[] {
  const {
    approvedFieldSize,
    survivorCounts,
    seasonStart,
    seasonEnd,
    finalWeekProtectionDays = 7,
  } = input;

  validateSeasonWindow(seasonStart, seasonEnd, DEFAULT_COMPETITION_TIMEZONE);

  const counts = derivePhaseCounts(approvedFieldSize, survivorCounts);
  const seasonStartDate = new Date(seasonStart);
  const seasonEndDate = new Date(seasonEnd);
  const seasonDurationMs = seasonEndDate.getTime() - seasonStartDate.getTime();

  if (seasonDurationMs <= 0) {
    throw new Error('Season lifetime must be greater than zero');
  }

  const protectedDays = Math.min(Math.max(1, finalWeekProtectionDays), 7);
  const protectedMs = protectedDays * 24 * 60 * 60 * 1000;
  const finalWeekStart = new Date(seasonEndDate.getTime() - protectedMs);
  const availableBeforeFinalWeekMs = Math.max(0, finalWeekStart.getTime() - seasonStartDate.getTime());
  const minimumRequiredWindowMs = (counts.length - 1) * 24 * 60 * 60 * 1000;

  if (availableBeforeFinalWeekMs < minimumRequiredWindowMs) {
    throw new Error('Season lifetime cannot accommodate the required competition');
  }

  const phaseCount = counts.length;
  const phases: GeneratedPhase[] = [];

  if (phaseCount === 1) {
    phases.push({
      phaseNumber: 1,
      playerCount: counts[0],
      startDate: seasonStartDate,
      endDate: seasonEndDate,
      status: 'DRAFT',
      isFinalPhase: true,
      durationMs: seasonDurationMs,
    });
    return phases;
  }

  const nonFinalWindowMs = Math.max(1, finalWeekStart.getTime() - seasonStartDate.getTime());
  const segmentMs = nonFinalWindowMs / (phaseCount - 1);

  for (let index = 0; index < phaseCount; index += 1) {
    const isFinalPhase = index === phaseCount - 1;
    const playerCount = counts[index];
    const startDate = isFinalPhase
      ? new Date(Math.max(seasonStartDate.getTime(), finalWeekStart.getTime()))
      : new Date(seasonStartDate.getTime() + index * segmentMs);
    const endDate = isFinalPhase
      ? seasonEndDate
      : new Date(seasonStartDate.getTime() + (index + 1) * segmentMs);

    const durationMs = isFinalPhase
      ? seasonEndDate.getTime() - startDate.getTime()
      : endDate.getTime() - startDate.getTime();

    if (startDate < seasonStartDate || endDate > seasonEndDate) {
      throw new Error('Phase dates cannot exceed the season start and end boundary');
    }

    if (isFinalPhase && endDate > seasonEndDate) {
      throw new Error('Final phase must finish within the protected final week of the season');
    }

    phases.push({
      phaseNumber: index + 1,
      playerCount,
      startDate,
      endDate,
      status: 'DRAFT',
      isFinalPhase,
      durationMs,
    });
  }

  const finalPhase = phases[phases.length - 1];
  if (finalPhase.startDate < finalWeekStart) {
    throw new Error('Final phase must be reserved for the final week of the season');
  }

  return phases;
}

export function calculateInitialPlotCount(fieldSize: number): number {
  if (!Number.isFinite(fieldSize) || fieldSize <= 0) {
    throw new Error('Field size must be greater than zero');
  }

  return Math.min(10, Math.ceil(fieldSize / 20));
}

export function calculateLaterPlotCount(previousPlotCount: number, currentPlayers: number): number {
  if (!Number.isFinite(previousPlotCount) || previousPlotCount <= 0) {
    throw new Error('Previous plot count must be greater than zero');
  }

  if (!Number.isFinite(currentPlayers) || currentPlayers <= 0) {
    throw new Error('Current player count must be greater than zero');
  }

  const normalizedPreviousPlotCount = Math.max(1, previousPlotCount);
  const targetPlotCount = Math.ceil(currentPlayers / 20);

  return Math.max(1, Math.min(normalizedPreviousPlotCount - 1, targetPlotCount));
}

export interface PhasePlotDistributionInput {
  playerIds: string[];
  previousPlotCount?: number;
  phaseNumber?: number;
  phaseId?: string;
  seedOrder?: string[];
}

export function buildPhasePlots(input: PhasePlotDistributionInput): CompetitionPlot[] {
  const {
    playerIds,
    previousPlotCount,
    phaseNumber = 1,
    phaseId,
    seedOrder,
  } = input;

  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  for (const playerId of playerIds) {
    if (!playerId || typeof playerId !== 'string' || !playerId.trim()) {
      throw new Error('Player ids must be non-empty strings');
    }
    if (seen.has(playerId)) {
      throw new Error('Each player must belong to only one plot in a phase');
    }
    seen.add(playerId);
  }

  const plotCount = previousPlotCount == null
    ? calculateInitialPlotCount(playerIds.length)
    : calculateLaterPlotCount(previousPlotCount, playerIds.length);

  const orderedPlayers = seedOrder && seedOrder.length > 0
    ? [
        ...seedOrder.filter((playerId) => seen.has(playerId)),
        ...playerIds.filter((playerId) => !seedOrder.includes(playerId)),
      ]
    : [...playerIds];

  const plots: CompetitionPlot[] = Array.from({ length: plotCount }, (_, index) => ({
    id: `plot-${phaseNumber}-${index + 1}`,
    phaseId: phaseId ?? `phase-${phaseNumber}`,
    name: `Plot ${index + 1}`,
    playerIds: [],
    status: 'ACTIVE',
    seriesCollection: [],
  }));

  orderedPlayers.forEach((playerId, index) => {
    const plotIndex = index % plotCount;
    plots[plotIndex].playerIds.push(playerId);
  });

  return plots;
}

export interface BuildSeriesForPlotInput {
  plot: CompetitionPlot;
  phaseNumber: number;
  seasonId: string;
  playerOrder?: string[];
}

export interface GeneratedSeriesRecord {
  seriesNumber: number;
  seriesKey: string;
  seasonId: string;
  phaseId: string;
  plotId: string;
  players: string[];
  games: Array<{
    gameNumber: number;
    phaseId: string;
    plotId: string;
    seriesKey: string;
    homePlayerId: string;
    awayPlayerId: string;
    status: 'PENDING';
    result: null;
  }>;
}

export function buildSeriesForPlot(input: BuildSeriesForPlotInput): GeneratedSeriesRecord[] {
  const { plot, phaseNumber, seasonId, playerOrder } = input;

  if (!plot || !Array.isArray(plot.playerIds) || plot.playerIds.length < 2) {
    throw new Error('A plot must contain at least two players to generate series');
  }

  const orderedPlayers = Array.isArray(playerOrder) && playerOrder.length > 0
    ? [...playerOrder.filter((playerId) => plot.playerIds.includes(playerId))]
    : [...plot.playerIds];

  if (orderedPlayers.length !== plot.playerIds.length) {
    throw new Error('Player ordering must include every player in the plot exactly once');
  }

  const pairings: GeneratedSeriesRecord[] = [];
  for (let index = 0; index < orderedPlayers.length; index += 1) {
    for (let opponentIndex = index + 1; opponentIndex < orderedPlayers.length; opponentIndex += 1) {
      const homePlayerId = orderedPlayers[index];
      const awayPlayerId = orderedPlayers[opponentIndex];
      const seriesNumber = pairings.length + 1;
      const seriesKey = `${seasonId}:phase-${phaseNumber}:plot-${plot.id}:series-${seriesNumber}`;

      pairings.push({
        seriesNumber,
        seriesKey,
        seasonId,
        phaseId: plot.phaseId ?? `phase-${phaseNumber}`,
        plotId: plot.id ?? `plot-${phaseNumber}`,
        players: [homePlayerId, awayPlayerId],
        games: Array.from({ length: 3 }, (_, gameIndex) => ({
          gameNumber: gameIndex + 1,
          phaseId: plot.phaseId ?? `phase-${phaseNumber}`,
          plotId: plot.id ?? `plot-${phaseNumber}`,
          seriesKey,
          homePlayerId,
          awayPlayerId,
          status: 'PENDING',
          result: null,
        })),
      });
    }
  }

  return pairings;
}

export interface OddFieldNormalizationInput {
  playerIds: string[];
  phaseNumber: number;
  seasonId: string;
  approvedOrder?: string[];
  normalizationOutcome?: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW';
}

export interface OddFieldNormalizationResult {
  needsNormalization: boolean;
  normalizationSeries: {
    seriesNumber: number;
    seriesKey: string;
    players: string[];
    games: Array<{
      gameNumber: number;
      phaseId: string;
      plotId: string;
      seriesKey: string;
      homePlayerId: string;
      awayPlayerId: string;
      status: 'PENDING';
      result: null;
    }>;
    result: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW';
    rule: 'ODD_FIELD_NORMALIZATION';
  };
  evenField: string[];
  remainingPlayers: string[];
  operatorNote: string;
}

export function normalizeOddField(input: OddFieldNormalizationInput): OddFieldNormalizationResult {
  const { playerIds, phaseNumber, seasonId, approvedOrder, normalizationOutcome = 'HOME_WIN' } = input;

  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    throw new Error('Odd-field normalization requires at least one player');
  }

  if (playerIds.length % 2 === 0) {
    return {
      needsNormalization: false,
      normalizationSeries: {
        seriesNumber: 0,
        seriesKey: `${seasonId}:phase-${phaseNumber}:normalization-0`,
        players: [],
        games: [],
        result: 'DRAW',
        rule: 'ODD_FIELD_NORMALIZATION',
      },
      evenField: [...playerIds],
      remainingPlayers: [...playerIds],
      operatorNote: 'No odd-field normalization required.',
    };
  }

  const ordering = Array.isArray(approvedOrder) && approvedOrder.length > 0
    ? [...approvedOrder.filter((playerId) => playerIds.includes(playerId))]
    : [...playerIds];

  if (ordering.length !== playerIds.length) {
    throw new Error('Approved ordering must include every player once');
  }

  const normalizationPair = ordering.slice(0, 2);
  const remaining = ordering.slice(2);
  const seriesNumber = 1;
  const seriesKey = `${seasonId}:phase-${phaseNumber}:normalization-${seriesNumber}`;

  const result: OddFieldNormalizationResult['normalizationSeries']['result'] = normalizationOutcome;
  const winner = normalizationOutcome === 'DRAW'
    ? null
    : normalizationOutcome === 'HOME_WIN'
      ? normalizationPair[0]
      : normalizationPair[1];

  const base = normalizationOutcome === 'DRAW' ? [...remaining] : [...remaining, winner ?? ''];
  const orderedRemaining = Array.from(
    new Set(
      (Array.isArray(approvedOrder) && approvedOrder.length > 0 ? approvedOrder : ordering)
        .filter((playerId) => base.includes(playerId) || (winner !== null && playerId === winner)),
    ),
  );

  const normalizedRemaining = normalizationOutcome === 'DRAW'
    ? orderedRemaining
    : winner === null
      ? orderedRemaining
      : orderedRemaining;

  const operatorNote = normalizationOutcome === 'DRAW'
    ? `Odd-field normalization occurred for phase ${phaseNumber}; draw eliminated both players.`
    : `Odd-field normalization occurred for phase ${phaseNumber}; winner ${winner ?? 'none'} remained in the advancement pool.`;

  return {
    needsNormalization: true,
    normalizationSeries: {
      seriesNumber,
      seriesKey,
      players: normalizationPair,
      games: Array.from({ length: 3 }, (_, gameIndex) => ({
        gameNumber: gameIndex + 1,
        phaseId: `phase-${phaseNumber}`,
        plotId: `normalization-phase-${phaseNumber}`,
        seriesKey,
        homePlayerId: normalizationPair[0],
        awayPlayerId: normalizationPair[1],
        status: 'PENDING',
        result: null,
      })),
      result,
      rule: 'ODD_FIELD_NORMALIZATION',
    },
    evenField: normalizedRemaining,
    remainingPlayers: normalizedRemaining,
    operatorNote,
  };
}

export type CompetitionGameResult = 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' | 'UNRESOLVED';
export type CompetitionSeriesResolutionState = 'UNRESOLVED' | 'IN_PROGRESS' | 'RESOLVED' | 'DRAW';

export interface RecordGameResultInput {
  game: {
    gameNumber: number;
    homePlayerId: string;
    awayPlayerId: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
    result: CompetitionGameResult | null;
    winnerPlayerId: string | null;
    completedAt: string | null;
    resultRecordedAt: string | null;
    resultRecordedById: string | null;
    resultVersion?: number;
  };
  result: CompetitionGameResult;
  recordedAt?: string | Date;
  recordedById?: string | null;
  reason?: string;
}

export function recordGameResult(input: RecordGameResultInput) {
  const { game, result } = input;

  if (game.status === 'COMPLETED' || game.result !== null) {
    throw new Error(`Game ${game.gameNumber} already has a result`);
  }
  if (!Number.isInteger(game.gameNumber) || game.gameNumber < 1 || game.gameNumber > 3) {
    throw new Error('Game number must be between 1 and 3');
  }
  if (result !== 'HOME_WIN' && result !== 'AWAY_WIN' && result !== 'DRAW' && result !== 'UNRESOLVED') {
    throw new Error('Game result must be a home win, away win, draw, or unresolved');
  }
  if (!game.homePlayerId || !game.awayPlayerId || game.homePlayerId === game.awayPlayerId) {
    throw new Error('A game result requires two distinct participants');
  }

  const rawRecordedAt = input.recordedAt instanceof Date
    ? input.recordedAt.toISOString()
    : input.recordedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(rawRecordedAt))) {
    throw new Error('Game result timestamp must be valid');
  }
  const recordedAt = new Date(rawRecordedAt).toISOString();

  const winnerPlayerId = result === 'HOME_WIN'
    ? game.homePlayerId
    : result === 'AWAY_WIN'
      ? game.awayPlayerId
      : null;
  const updatedGame = {
    ...game,
    status: 'COMPLETED' as const,
    result,
    winnerPlayerId,
    completedAt: recordedAt,
    resultRecordedAt: recordedAt,
    resultRecordedById: input.recordedById ?? null,
    resultVersion: (game.resultVersion ?? 0) + 1,
  };

  return {
    game: updatedGame,
    audit: {
      action: 'RESULT_RECORDED' as const,
      actorId: input.recordedById ?? null,
      reason: input.reason ?? null,
      recordedAt,
      resultVersion: updatedGame.resultVersion,
      beforeState: {
        status: game.status,
        result: game.result,
        winnerPlayerId: game.winnerPlayerId,
        resultVersion: game.resultVersion ?? 0,
      },
      afterState: {
        status: updatedGame.status,
        result: updatedGame.result,
        winnerPlayerId: updatedGame.winnerPlayerId,
        resultVersion: updatedGame.resultVersion,
      },
    },
  };
}

export interface SeriesGameResultInput {
  gameNumber: number;
  homePlayerId: string;
  awayPlayerId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  result: CompetitionGameResult | null;
  winnerPlayerId: string | null;
}

export interface SeriesResultSummary {
  expectedGameCount: 3;
  completedGameCount: number;
  homePlayerId: string;
  awayPlayerId: string;
  homeWins: number;
  awayWins: number;
  draws: number;
  unresolvedGames: number;
  playerWinCounts: Record<string, number>;
  resolutionState: CompetitionSeriesResolutionState;
  winnerPlayerId: string | null;
  eliminationOutcome: 'WINNER_ADVANCES' | 'BOTH_ELIMINATED' | null;
  eliminatedPlayerIds: string[];
}

export function resolveSeriesResult(games: SeriesGameResultInput[]): SeriesResultSummary {
  if (!Array.isArray(games) || games.length !== 3) {
    throw new Error('A series must contain exactly three games');
  }

  const sortedGames = [...games].sort((left, right) => left.gameNumber - right.gameNumber);
  if (sortedGames.some((game, index) => game.gameNumber !== index + 1)) {
    throw new Error('A series must contain each game number exactly once');
  }

  const firstGame = sortedGames[0];
  const homePlayerId = firstGame.homePlayerId;
  const awayPlayerId = firstGame.awayPlayerId;
  if (!homePlayerId || !awayPlayerId || homePlayerId === awayPlayerId) {
    throw new Error('A series requires the same two distinct participants in every game');
  }

  const playerWinCounts: Record<string, number> = { [homePlayerId]: 0, [awayPlayerId]: 0 };
  let completedGameCount = 0;
  let draws = 0;
  let unresolvedGames = 0;

  for (const game of sortedGames) {
    const validParticipants = game.homePlayerId === homePlayerId && game.awayPlayerId === awayPlayerId
      || game.homePlayerId === awayPlayerId && game.awayPlayerId === homePlayerId;
    if (!validParticipants) {
      throw new Error('A series requires the same two participants in every game');
    }
    if (game.status === 'COMPLETED') {
      if (game.result === null) {
        throw new Error(`Completed game ${game.gameNumber} must have a result`);
      }
      completedGameCount += 1;
      if (game.result === 'DRAW') {
        if (game.winnerPlayerId !== null) {
          throw new Error(`Drawn game ${game.gameNumber} cannot have a winner`);
        }
        draws += 1;
        continue;
      }
      if (game.result === 'UNRESOLVED') {
        if (game.winnerPlayerId !== null) {
          throw new Error(`Unresolved game ${game.gameNumber} cannot have a winner`);
        }
        unresolvedGames += 1;
        continue;
      }

      const expectedWinner = game.result === 'HOME_WIN' ? game.homePlayerId : game.awayPlayerId;
      if (game.winnerPlayerId !== expectedWinner) {
        throw new Error(`Game ${game.gameNumber} winner does not match its result`);
      }
      playerWinCounts[expectedWinner] += 1;
    } else if (game.result !== null || game.winnerPlayerId !== null) {
      throw new Error(`Incomplete game ${game.gameNumber} cannot have a result`);
    }
  }

  const homeWins = playerWinCounts[homePlayerId];
  const awayWins = playerWinCounts[awayPlayerId];
  const hasNormalResult = (homeWins === 2 && awayWins === 1) || (homeWins === 1 && awayWins === 2);
  const resolutionState: CompetitionSeriesResolutionState = draws > 0
    ? 'DRAW'
    : completedGameCount === 0
      ? 'UNRESOLVED'
      : completedGameCount < 3
        ? 'IN_PROGRESS'
        : hasNormalResult
          ? 'RESOLVED'
          : 'UNRESOLVED';
  const winnerPlayerId = resolutionState === 'RESOLVED'
    ? homeWins > awayWins ? homePlayerId : awayPlayerId
    : null;
  const eliminatedPlayerIds = resolutionState === 'DRAW'
    || (resolutionState === 'UNRESOLVED' && completedGameCount === 3)
    ? [homePlayerId, awayPlayerId]
    : winnerPlayerId === null
      ? []
      : [winnerPlayerId === homePlayerId ? awayPlayerId : homePlayerId];

  return {
    expectedGameCount: 3,
    completedGameCount,
    homePlayerId,
    awayPlayerId,
    homeWins,
    awayWins,
    draws,
    unresolvedGames,
    playerWinCounts,
    resolutionState,
    winnerPlayerId,
    eliminationOutcome: resolutionState === 'DRAW'
      || (resolutionState === 'UNRESOLVED' && completedGameCount === 3)
      ? 'BOTH_ELIMINATED'
      : resolutionState === 'RESOLVED'
        ? 'WINNER_ADVANCES'
        : null,
    eliminatedPlayerIds,
  };
}

export interface ResolveSeriesAdvancementInput {
  seriesId: string;
  games: SeriesGameResultInput[];
  actorId?: string | null;
  reason?: string | null;
  resolvedAt?: string | Date;
}

export interface SeriesAdvancementAudit {
  action: 'SERIES_ADVANCEMENT_RESOLVED';
  seriesId: string;
  idempotencyKey: string;
  actorId: string | null;
  reason: 'NORMAL_RESULT' | 'GAME_DRAW' | 'NO_VALID_OUTCOME';
  resolvedAt: string | null;
  outcome: 'WINNER_ADVANCES' | 'BOTH_ELIMINATED';
  advancingPlayerId: string | null;
  eliminatedPlayerIds: string[];
  gameResults: Array<{
    gameNumber: number;
    result: CompetitionGameResult | null;
    winnerPlayerId: string | null;
  }>;
  beforeState: {
    completedGameCount: number;
    homeWins: number;
    awayWins: number;
    draws: number;
    unresolvedGames: number;
  };
  afterState: {
    state: 'ADVANCED' | 'ELIMINATED';
    advancingPlayerId: string | null;
    eliminatedPlayerIds: string[];
  };
}

export interface SeriesAdvancementResult {
  seriesId: string;
  state: 'PENDING' | 'ADVANCED' | 'ELIMINATED';
  advancingPlayerId: string | null;
  eliminatedPlayerIds: string[];
  reason: 'GAMES_INCOMPLETE' | 'NORMAL_RESULT' | 'GAME_DRAW' | 'NO_VALID_OUTCOME';
  summary: SeriesResultSummary;
  audit: SeriesAdvancementAudit | null;
}

export function resolveSeriesAdvancement(input: ResolveSeriesAdvancementInput): SeriesAdvancementResult {
  if (!input.seriesId.trim()) {
    throw new Error('Series id is required to resolve advancement');
  }

  const summary = resolveSeriesResult(input.games);
  const orderedGames = [...input.games].sort((left, right) => left.gameNumber - right.gameNumber);
  const hasDraw = summary.draws > 0;
  const hasCompletedAllGames = summary.completedGameCount === summary.expectedGameCount;
  const state: SeriesAdvancementResult['state'] = hasDraw
    ? 'ELIMINATED'
    : !hasCompletedAllGames
      ? 'PENDING'
      : summary.resolutionState === 'RESOLVED'
        ? 'ADVANCED'
        : 'ELIMINATED';
  const reason: SeriesAdvancementResult['reason'] = hasDraw
    ? 'GAME_DRAW'
    : !hasCompletedAllGames
      ? 'GAMES_INCOMPLETE'
      : state === 'ADVANCED'
        ? 'NORMAL_RESULT'
        : 'NO_VALID_OUTCOME';
  const advancingPlayerId = state === 'ADVANCED' ? summary.winnerPlayerId : null;
  const eliminatedPlayerIds = summary.eliminatedPlayerIds;

  if (state === 'PENDING') {
    return {
      seriesId: input.seriesId,
      state,
      advancingPlayerId,
      eliminatedPlayerIds,
      reason,
      summary,
      audit: null,
    };
  }

  const idempotencyKey = `${input.seriesId}:${JSON.stringify(orderedGames.map((game) => ({
    gameNumber: game.gameNumber,
    status: game.status,
    result: game.result,
    winnerPlayerId: game.winnerPlayerId,
  })))}`;
  const resolvedAtInput = input.resolvedAt instanceof Date
    ? input.resolvedAt.toISOString()
    : input.resolvedAt ?? null;
  if (resolvedAtInput !== null && Number.isNaN(Date.parse(resolvedAtInput))) {
    throw new Error('Series resolution timestamp must be valid');
  }
  const resolvedAt = resolvedAtInput === null ? null : new Date(resolvedAtInput).toISOString();

  return {
    seriesId: input.seriesId,
    state,
    advancingPlayerId,
    eliminatedPlayerIds,
    reason,
    summary,
    audit: {
      action: 'SERIES_ADVANCEMENT_RESOLVED',
      seriesId: input.seriesId,
      idempotencyKey,
      actorId: input.actorId ?? null,
      reason: reason as SeriesAdvancementAudit['reason'],
      resolvedAt,
      outcome: state === 'ADVANCED' ? 'WINNER_ADVANCES' : 'BOTH_ELIMINATED',
      advancingPlayerId,
      eliminatedPlayerIds,
      gameResults: orderedGames.map((game) => ({
        gameNumber: game.gameNumber,
        result: game.result,
        winnerPlayerId: game.winnerPlayerId,
      })),
      beforeState: {
        completedGameCount: summary.completedGameCount,
        homeWins: summary.homeWins,
        awayWins: summary.awayWins,
        draws: summary.draws,
        unresolvedGames: summary.unresolvedGames,
      },
      afterState: {
        state,
        advancingPlayerId,
        eliminatedPlayerIds,
      },
    },
  };
}

export interface PhaseTransitionSeriesInput {
  id: string;
  status: 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'ELIMINATED' | 'DISPUTED';
  games: SeriesGameResultInput[];
  advancement: SeriesAdvancementResult;
}

export interface PhaseProgressionInput {
  phaseStatus: string;
  participantIds: string[];
  plots: Array<{ id: string; name: string; playerIds: string[] }>;
  series: Array<{
    id: string;
    status: string;
    playerIds: string[];
    winnerPlayerId: string | null;
    eliminatedPlayerIds: string[];
    games: Array<{ status: string; result: CompetitionGameOutcome | null }>;
  }>;
}

export interface PhaseProgressionParticipant {
  playerId: string;
  plotIds: string[];
  seriesPlayed: number;
  gamesPlayed: number;
  seriesWins: number;
  seriesLosses: number;
  eliminations: number;
  survivor: boolean;
  advancementEligible: boolean;
}

export interface PhaseProgressionSummary {
  phaseFinalized: boolean;
  participantCount: number;
  playedSeriesCount: number;
  pendingSeriesCount: number;
  gamesPlayedCount: number;
  survivors: string[];
  advancementEligiblePlayerIds: string[];
  participants: PhaseProgressionParticipant[];
}

export interface PhaseCompletionAssessmentInput {
  participantIds: string[];
  plots: Array<{ id: string; name: string; playerIds: string[] }>;
  series: Array<{
    id: string;
    status: string;
    playerIds: string[];
    winnerPlayerId: string | null;
    eliminatedPlayerIds: string[];
    advancementFinalized: boolean;
    games: Array<{
      status: string;
      result: CompetitionGameOutcome | null;
      currentVerificationStatus: string | null;
    }>;
  }>;
  blockOnUnresolvedDisputes: boolean;
  unresolvedDisputeCount: number;
  unappliedPenaltyCount: number;
  nextPhaseRequired: boolean;
  nextPhaseTimingFeasible: boolean;
  nextPhaseTimingReason?: string | null;
}

export interface PhaseCompletionBlocker {
  code:
    | 'NO_SERIES'
    | 'SERIES_INCOMPLETE'
    | 'GAMES_INCOMPLETE'
    | 'GAME_RESULT_UNVERIFIED'
    | 'ADVANCEMENT_NOT_FINALIZED'
    | 'UNRESOLVED_DISPUTES'
    | 'PENALTY_EFFECTS_PENDING'
    | 'NEXT_PHASE_TIMING_INFEASIBLE'
    | 'INSUFFICIENT_ADVANCEMENT_FIELD';
  message: string;
  targetId?: string;
}

export interface PhaseCompletionAssessment {
  ready: boolean;
  blockers: PhaseCompletionBlocker[];
  progression: PhaseProgressionSummary;
}

export function assessPhaseCompletion(input: PhaseCompletionAssessmentInput): PhaseCompletionAssessment {
  const blockers: PhaseCompletionBlocker[] = [];
  if (input.series.length === 0) {
    blockers.push({ code: 'NO_SERIES', message: 'A Phase cannot complete without Series.' });
  }

  for (const series of input.series) {
    if (series.status !== 'COMPLETED' && series.status !== 'ELIMINATED') {
      blockers.push({
        code: 'SERIES_INCOMPLETE',
        message: `Series ${series.id} has not been resolved.`,
        targetId: series.id,
      });
    }
    if (series.games.length !== SERIES_GAME_COUNT
      || series.games.some((game) => game.status !== 'COMPLETED' || game.result === null)) {
      blockers.push({
        code: 'GAMES_INCOMPLETE',
        message: `Series ${series.id} does not have finalized results for every Game.`,
        targetId: series.id,
      });
    }
    if (series.games.some((game) => game.currentVerificationStatus !== 'APPROVED'
      && game.currentVerificationStatus !== 'OVERRIDDEN')) {
      blockers.push({
        code: 'GAME_RESULT_UNVERIFIED',
        message: `Series ${series.id} has a Game result that is not approved or overridden.`,
        targetId: series.id,
      });
    }
    if (!series.advancementFinalized) {
      blockers.push({
        code: 'ADVANCEMENT_NOT_FINALIZED',
        message: `Series ${series.id} has no finalized advancement outcome.`,
        targetId: series.id,
      });
    }
  }

  if (input.blockOnUnresolvedDisputes && input.unresolvedDisputeCount > 0) {
    blockers.push({
      code: 'UNRESOLVED_DISPUTES',
      message: `${input.unresolvedDisputeCount} dispute(s) affecting this Phase remain unresolved.`,
    });
  }
  if (input.unappliedPenaltyCount > 0) {
    blockers.push({
      code: 'PENALTY_EFFECTS_PENDING',
      message: `${input.unappliedPenaltyCount} penalty effect(s) affecting this Phase have not been applied.`,
    });
  }
  if (!input.nextPhaseTimingFeasible) {
    blockers.push({
      code: 'NEXT_PHASE_TIMING_INFEASIBLE',
      message: input.nextPhaseTimingReason ?? 'The next Phase cannot fit within the remaining season window.',
    });
  }

  const progression = calculatePhaseProgression({
    phaseStatus: 'COMPLETED',
    participantIds: input.participantIds,
    plots: input.plots,
    series: input.series,
  });
  if (blockers.length === 0 && input.nextPhaseRequired
    && progression.advancementEligiblePlayerIds.length < 2) {
    blockers.push({
      code: 'INSUFFICIENT_ADVANCEMENT_FIELD',
      message: 'At least two eligible survivors are required to create the next Phase.',
    });
  }

  return { ready: blockers.length === 0, blockers, progression };
}

export function calculatePhaseProgression(input: PhaseProgressionInput): PhaseProgressionSummary {
  const participants = Array.from(new Set([
    ...input.participantIds,
    ...input.plots.flatMap((plot) => plot.playerIds),
    ...input.series.flatMap((series) => series.playerIds),
  ]));
  const plotIdsByPlayer = new Map(participants.map((playerId) => [playerId, [] as string[]]));
  for (const plot of input.plots) {
    for (const playerId of plot.playerIds) {
      const assignedPlots = plotIdsByPlayer.get(playerId);
      if (assignedPlots && !assignedPlots.includes(plot.id)) assignedPlots.push(plot.id);
    }
  }

  const stats = new Map(participants.map((playerId) => [playerId, {
    seriesPlayed: 0,
    gamesPlayed: 0,
    seriesWins: 0,
    seriesLosses: 0,
    eliminations: 0,
  }]));
  let playedSeriesCount = 0;
  let gamesPlayedCount = 0;
  let allSeriesFinalized = input.series.length > 0;

  for (const series of input.series) {
    const validParticipants = series.playerIds.length === 2
      && series.playerIds[0] !== series.playerIds[1]
      && series.playerIds.every((playerId) => stats.has(playerId));
    const allGamesResolved = series.games.length === SERIES_GAME_COUNT
      && series.games.every((game) => game.status === 'COMPLETED' && game.result !== null);
    const finalized = validParticipants
      && allGamesResolved
      && (series.status === 'COMPLETED' || series.status === 'ELIMINATED');
    if (!finalized) allSeriesFinalized = false;
    for (const game of series.games) {
      if (game.status !== 'COMPLETED' || game.result === null) continue;
      gamesPlayedCount += 1;
      for (const playerId of series.playerIds) {
        const playerStats = stats.get(playerId);
        if (playerStats) playerStats.gamesPlayed += 1;
      }
    }
    if (!finalized) continue;

    if (series.status === 'COMPLETED'
      && (!series.winnerPlayerId || !series.playerIds.includes(series.winnerPlayerId))) {
      allSeriesFinalized = false;
      continue;
    }
    const eliminatedPlayerIds = series.status === 'ELIMINATED'
      ? series.eliminatedPlayerIds.length > 0
        ? series.eliminatedPlayerIds
        : series.playerIds
      : series.eliminatedPlayerIds.length > 0
        ? series.eliminatedPlayerIds
        : series.playerIds.filter((playerId) => playerId !== series.winnerPlayerId);
    const validEliminations = eliminatedPlayerIds.filter((playerId) => series.playerIds.includes(playerId));
    playedSeriesCount += 1;
    for (const playerId of series.playerIds) {
      const playerStats = stats.get(playerId)!;
      playerStats.seriesPlayed += 1;
      if (series.status === 'COMPLETED') {
        if (playerId === series.winnerPlayerId) playerStats.seriesWins += 1;
        else playerStats.seriesLosses += 1;
      } else {
        playerStats.seriesLosses += 1;
      }
    }
    for (const playerId of validEliminations) {
      const playerStats = stats.get(playerId)!;
      playerStats.eliminations += 1;
    }
  }

  const allParticipantsPlayed = participants.every((playerId) => (stats.get(playerId)?.seriesPlayed ?? 0) > 0);
  const phaseFinalized = input.phaseStatus === 'COMPLETED' && allSeriesFinalized && allParticipantsPlayed;
  const eliminated = new Set(
    participants.filter((playerId) => (stats.get(playerId)?.eliminations ?? 0) > 0),
  );
  const survivors = phaseFinalized
    ? participants.filter((playerId) => !eliminated.has(playerId) && (stats.get(playerId)?.seriesPlayed ?? 0) > 0)
    : [];
  const advancementEligiblePlayerIds = [...survivors];

  return {
    phaseFinalized,
    participantCount: participants.length,
    playedSeriesCount,
    pendingSeriesCount: input.series.length - playedSeriesCount,
    gamesPlayedCount,
    survivors,
    advancementEligiblePlayerIds,
    participants: participants.map((playerId) => {
      const playerStats = stats.get(playerId)!;
      const survivor = phaseFinalized && !eliminated.has(playerId) && playerStats.seriesPlayed > 0;
      return {
        playerId,
        plotIds: plotIdsByPlayer.get(playerId) ?? [],
        ...playerStats,
        survivor,
        advancementEligible: survivor,
      };
    }),
  };
}

export interface PhaseTransitionInput {
  seasonId: string;
  seasonStart: Date | string;
  seasonEnd: Date | string;
  transitionAt: Date | string;
  nextPhaseId: string;
  actorId?: string | null;
  seedOrder?: string[];
  currentPhase: {
    id: string;
    phaseNumber: number;
    status: string;
    endAt?: Date | string | null;
    plotCount: number;
    previousPlots?: Array<{ playerIds: string[] }>;
  };
  series: PhaseTransitionSeriesInput[];
}

export interface PhaseTransitionAudit {
  action: 'PHASE_TRANSITIONED';
  idempotencyKey: string;
  fromPhaseId: string;
  toPhaseId: string;
  actorId: string | null;
  transitionedAt: string;
  sourceSeriesIds: string[];
  advancementPool: string[];
  eliminatedPlayerIds: string[];
  phaseWindow: { startAt: string; endAt: string };
}

export interface PhaseTransitionPlan {
  transitionIdempotencyKey: string;
  advancementPool: string[];
  eliminatedPlayerIds: string[];
  nextPhase: {
    id: string;
    seasonId: string;
    phaseNumber: number;
    phaseType: 'PLAYOFF' | 'FINAL';
    startAt: string;
    endAt: string;
    status: 'DRAFT';
    participatingPlayerIds: string[];
  };
  plots: CompetitionPlot[];
  series: GeneratedSeriesRecord[];
  audit: PhaseTransitionAudit;
}

export function planPhaseTransition(input: PhaseTransitionInput): PhaseTransitionPlan {
  const { currentPhase } = input;
  if (currentPhase.status !== 'COMPLETED') {
    throw new Error('Current phase must be completed before transition');
  }
  if (!currentPhase.id || !input.nextPhaseId || currentPhase.id === input.nextPhaseId) {
    throw new Error('Source and next phase ids must be distinct and non-empty');
  }
  if (!Number.isInteger(currentPhase.phaseNumber) || currentPhase.phaseNumber < 1) {
    throw new Error('Current phase number must be a positive integer');
  }
  if (!Number.isInteger(currentPhase.plotCount) || currentPhase.plotCount < 1) {
    throw new Error('Current phase must have at least one plot');
  }
  if (!Array.isArray(input.series) || input.series.length === 0) {
    throw new Error('A phase cannot transition without Series');
  }

  const transitionedAtInput = input.transitionAt instanceof Date
    ? input.transitionAt.toISOString()
    : input.transitionAt;
  if (Number.isNaN(Date.parse(transitionedAtInput))) {
    throw new Error('Phase transition timestamp must be valid');
  }
  const transitionedAt = new Date(transitionedAtInput).toISOString();
  const currentPhaseEnd = currentPhase.endAt == null
    ? new Date(transitionedAt)
    : new Date(currentPhase.endAt);
  if (Number.isNaN(currentPhaseEnd.getTime())) {
    throw new Error('Current phase end timestamp must be valid');
  }
  const remainingSeasonStart = new Date(Math.max(Date.parse(transitionedAt), currentPhaseEnd.getTime()));
  const nextPhaseNumber = currentPhase.phaseNumber + 1;
  const evaluatedSeries = input.series.map((series) => {
    if (series.status !== 'COMPLETED' && series.status !== 'ELIMINATED') {
      throw new Error(`Series ${series.id} must be completed or eliminated before phase transition`);
    }
    const summary = resolveSeriesResult(series.games);
    if (summary.completedGameCount !== summary.expectedGameCount) {
      throw new Error(`Series ${series.id} has unresolved Game results`);
    }

    const expectedAdvancement = resolveSeriesAdvancement({
      seriesId: series.id,
      games: series.games,
      actorId: series.advancement.audit?.actorId,
      resolvedAt: series.advancement.audit?.resolvedAt ?? undefined,
    });
    if (
      series.advancement.state !== expectedAdvancement.state
      || series.advancement.advancingPlayerId !== expectedAdvancement.advancingPlayerId
      || series.advancement.audit?.idempotencyKey !== expectedAdvancement.audit?.idempotencyKey
      || (expectedAdvancement.state === 'ADVANCED' && series.status !== 'COMPLETED')
      || (expectedAdvancement.state === 'ELIMINATED' && series.status !== 'ELIMINATED')
    ) {
      throw new Error(`Series ${series.id} advancement outcome is not finalized`);
    }

    return { series, advancement: expectedAdvancement };
  });

  const eliminatedSet = new Set(evaluatedSeries.flatMap(({ advancement }) => advancement.eliminatedPlayerIds));
  const candidateSurvivors = Array.from(new Set(
    evaluatedSeries.flatMap(({ advancement }) => advancement.advancingPlayerId ? [advancement.advancingPlayerId] : []),
  ));
  const orderedSurvivors = input.seedOrder && input.seedOrder.length > 0
    ? [
        ...input.seedOrder.filter((playerId) => candidateSurvivors.includes(playerId)),
        ...candidateSurvivors.filter((playerId) => !input.seedOrder?.includes(playerId)),
      ]
    : candidateSurvivors;
  const advancementPool = orderedSurvivors.filter((playerId) => !eliminatedSet.has(playerId));
  const eliminatedPlayerIds = Array.from(eliminatedSet);
  if (advancementPool.length === 0) {
    throw new Error('No eligible survivors are available for the next phase');
  }
  if (advancementPool.length === 1) {
    throw new Error('At least two survivors are required to generate a next phase');
  }

  const phaseSequence = buildPhaseSequence({
    approvedFieldSize: advancementPool.length,
    seasonStart: remainingSeasonStart,
    seasonEnd: input.seasonEnd,
  });
  const nextPhaseWindow = phaseSequence[0];
  if (!nextPhaseWindow) {
    throw new Error('Season lifetime cannot accommodate the required competition');
  }
  const nextPhaseStart = new Date(nextPhaseWindow.startDate).toISOString();
  const nextPhaseEnd = new Date(nextPhaseWindow.endDate).toISOString();
  const plots = buildPhasePlots({
    playerIds: advancementPool,
    previousPlotCount: currentPhase.plotCount,
    phaseNumber: nextPhaseNumber,
    phaseId: input.nextPhaseId,
    seedOrder: input.seedOrder,
  });
  const generatedSeries = plots.flatMap((plot) => buildSeriesForPlot({
    plot,
    phaseNumber: nextPhaseNumber,
    seasonId: input.seasonId,
    playerOrder: advancementPool,
  }));
  const transitionIdempotencyKey = `${currentPhase.id}:phase-${nextPhaseNumber}`;
  const sortedSeriesIds = evaluatedSeries.map(({ series }) => series.id).sort();

  return {
    transitionIdempotencyKey,
    advancementPool,
    eliminatedPlayerIds,
    nextPhase: {
      id: input.nextPhaseId,
      seasonId: input.seasonId,
      phaseNumber: nextPhaseNumber,
      phaseType: nextPhaseWindow.isFinalPhase ? 'FINAL' : 'PLAYOFF',
      startAt: nextPhaseStart,
      endAt: nextPhaseEnd,
      status: 'DRAFT',
      participatingPlayerIds: advancementPool,
    },
    plots,
    series: generatedSeries,
    audit: {
      action: 'PHASE_TRANSITIONED',
      idempotencyKey: transitionIdempotencyKey,
      fromPhaseId: currentPhase.id,
      toPhaseId: input.nextPhaseId,
      actorId: input.actorId ?? null,
      transitionedAt,
      sourceSeriesIds: sortedSeriesIds,
      advancementPool,
      eliminatedPlayerIds,
      phaseWindow: { startAt: nextPhaseStart, endAt: nextPhaseEnd },
    },
  };
}

export interface AutomaticSeriesScheduleInput {
  competitionTimezone: string;
  seasonStartAt: Date | string;
  seasonEndAt: Date | string;
  currentDate?: Date | string;
  currentPhaseNumber?: number;
  capacityOptions?: {
    protectedFinalWeekDays?: number;
    availableSchedulingDays?: number[];
    dailySchedulingHours?: number;
    seriesDurationMinutes?: number;
    requiredTransitionHours?: number;
  };
  phases: Array<{ id: string; phaseNumber?: number; startAt: Date | string; endAt: Date | string }>;
  series: Array<{ id: string; phaseId: string; playerIds: string[] }>;
  existingAppointments?: Array<{
    seriesId: string;
    playerIds: string[];
    matchWindowStartAt: Date | string;
    matchWindowEndAt: Date | string;
  }>;
}

export interface AutomaticSeriesAppointment {
  seriesId: string;
  phaseId: string;
  playerIds: string[];
  scheduleKey: string;
  checkInOpensAt: string;
  checkInClosesAt: string;
  matchWindowStartAt: string;
  matchWindowEndAt: string;
  resultsDeadlineAt: string;
  timezone: string;
  gameNumbers: [1, 2, 3];
}

export interface AutomaticSeriesScheduleResult {
  feasible: boolean;
  scheduledSeries: AutomaticSeriesAppointment[];
  unscheduledSeries: Array<{
    seriesId: string;
    reason: 'CAPACITY_INSUFFICIENT' | 'PHASE_NOT_FOUND' | 'NO_AVAILABLE_ONE_HOUR_WINDOW';
  }>;
  validation: SeriesScheduleValidationReport;
  capacity: SeasonCapacityReport;
}

interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

const zonedDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getZonedDateTimeParts(date: Date, timezone: string): ZonedDateTimeParts {
  let formatter = zonedDateTimeFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    zonedDateTimeFormatterCache.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    weekday: values.weekday,
  };
}

function localDateTimeToUtc(year: number, month: number, day: number, hour: number, timezone: string): Date | null {
  const targetLocalAsUtc = Date.UTC(year, month - 1, day, hour);
  let candidate = targetLocalAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const represented = getZonedDateTimeParts(new Date(candidate), timezone);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
    );
    candidate = targetLocalAsUtc - (representedAsUtc - candidate);
  }

  const resolved = new Date(candidate);
  const parts = getZonedDateTimeParts(resolved, timezone);
  if (parts.year !== year || parts.month !== month || parts.day !== day || parts.hour !== hour || parts.minute !== 0) {
    return null;
  }
  return resolved;
}

function getAutomaticStartCandidates(startAt: number, endAt: number, timezone: string): Date[] {
  const localDates = new Set<string>();
  const firstUtcDay = new Date(startAt);
  firstUtcDay.setUTCHours(0, 0, 0, 0);
  firstUtcDay.setUTCDate(firstUtcDay.getUTCDate() - 2);
  const lastUtcDay = new Date(endAt);
  lastUtcDay.setUTCHours(0, 0, 0, 0);
  lastUtcDay.setUTCDate(lastUtcDay.getUTCDate() + 2);

  for (let date = firstUtcDay; date <= lastUtcDay; date.setUTCDate(date.getUTCDate() + 1)) {
    const localDate = getZonedDateTimeParts(date, timezone);
    localDates.add(`${localDate.year}-${localDate.month}-${localDate.day}`);
  }

  const candidates: Date[] = [];
  for (const dateKey of localDates) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday === 0) continue;

    for (let hour = 10; hour <= 21; hour += 1) {
      const candidate = localDateTimeToUtc(year, month, day, hour, timezone);
      if (candidate && candidate.getTime() >= startAt && candidate.getTime() + 60 * 60 * 1000 <= endAt) {
        candidates.push(candidate);
      }
    }
  }

  return candidates.sort((left, right) => left.getTime() - right.getTime());
}

export function scheduleSeriesAutomatically(input: AutomaticSeriesScheduleInput): AutomaticSeriesScheduleResult {
  if (!input.competitionTimezone || !input.competitionTimezone.trim()) {
    throw new Error('Competition timezone is required');
  }
  const timezone = input.competitionTimezone.trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new Error('Competition timezone is invalid');
  }

  const seasonStartAt = new Date(input.seasonStartAt).getTime();
  const seasonEndAt = new Date(input.seasonEndAt).getTime();
  if (!Number.isFinite(seasonStartAt) || !Number.isFinite(seasonEndAt) || seasonEndAt <= seasonStartAt) {
    throw new Error('Season schedule boundaries must be valid and increasing');
  }

  const orderedPhases = [...input.phases].sort((left, right) => {
    const leftNumber = left.phaseNumber ?? 0;
    const rightNumber = right.phaseNumber ?? 0;
    return leftNumber - rightNumber || new Date(left.startAt).getTime() - new Date(right.startAt).getTime();
  });
  const inferredFirstPhaseNumber = orderedPhases[0]?.phaseNumber ?? 1;
  const capacity = calculateSeasonCapacity({
    seasonStartAt: input.seasonStartAt,
    seasonEndAt: input.seasonEndAt,
    currentDate: input.currentDate ?? new Date(),
    competitionTimezone: timezone,
    currentPhaseNumber: input.currentPhaseNumber ?? inferredFirstPhaseNumber - 1,
    remainingPhases: orderedPhases.map((phase, index) => {
      const phaseNumber = phase.phaseNumber ?? inferredFirstPhaseNumber + index;
      const phaseSeries = input.series.filter((series) => series.phaseId === phase.id);
      return {
        phaseNumber,
        seriesCount: phaseSeries.length,
        participantIdsBySeries: phaseSeries.map((series) => series.playerIds),
      };
    }),
    ...input.capacityOptions,
  });

  if (!capacity.feasible) {
    const unscheduledSeries = input.series
      .map((series) => ({ seriesId: series.id, reason: 'CAPACITY_INSUFFICIENT' as const }))
      .sort((left, right) => left.seriesId.localeCompare(right.seriesId));
    const validation = validateSeriesSchedule({
      automatic: true,
      competitionTimezone: timezone,
      seasonStartAt: input.seasonStartAt,
      seasonEndAt: input.seasonEndAt,
      phases: input.phases,
      series: input.series,
      appointments: [],
    });
    return { feasible: false, scheduledSeries: [], unscheduledSeries, validation, capacity };
  }

  const seriesIds = new Set<string>();
  const series = [...input.series].sort((left, right) => left.id.localeCompare(right.id));
  for (const entry of series) {
    if (!entry.id || !entry.phaseId || seriesIds.has(entry.id)) {
      throw new Error('Scheduled Series must have unique, non-empty identities and Phase ids');
    }
    seriesIds.add(entry.id);
    if (!Array.isArray(entry.playerIds) || entry.playerIds.length !== 2
      || entry.playerIds.some((playerId) => !playerId.trim())
      || new Set(entry.playerIds).size !== 2) {
      throw new Error(`Series ${entry.id} must have exactly two distinct participants`);
    }
  }

  const reservations = (input.existingAppointments ?? [])
    .filter((appointment) => !seriesIds.has(appointment.seriesId))
    .map((appointment) => ({
      seriesId: appointment.seriesId,
      playerIds: appointment.playerIds,
      startAt: new Date(appointment.matchWindowStartAt).getTime(),
      endAt: new Date(appointment.matchWindowEndAt).getTime(),
    }))
    .filter((appointment) => Number.isFinite(appointment.startAt) && Number.isFinite(appointment.endAt)
      && appointment.endAt > appointment.startAt);

  const scheduledSeries: AutomaticSeriesAppointment[] = [];
  const unscheduledSeries: AutomaticSeriesScheduleResult['unscheduledSeries'] = [];
  const phases = new Map(input.phases.map((phase) => [phase.id, phase]));
  const candidateCache = new Map<string, Date[]>();
  const oneHourMs = 60 * 60 * 1000;

  for (const entry of series) {
    const phase = phases.get(entry.phaseId);
    if (!phase) {
      unscheduledSeries.push({ seriesId: entry.id, reason: 'PHASE_NOT_FOUND' });
      continue;
    }
    const phaseStartAt = new Date(phase.startAt).getTime();
    const phaseEndAt = new Date(phase.endAt).getTime();
    if (!Number.isFinite(phaseStartAt) || !Number.isFinite(phaseEndAt) || phaseEndAt <= phaseStartAt) {
      throw new Error(`Phase ${phase.id} schedule boundaries must be valid and increasing`);
    }

    const earliest = Math.max(seasonStartAt, phaseStartAt);
    const latest = Math.min(seasonEndAt, phaseEndAt);
    const cacheKey = `${phase.id}:${earliest}:${latest}:${timezone}`;
    let candidates = candidateCache.get(cacheKey);
    if (!candidates) {
      candidates = latest > earliest
        ? getAutomaticStartCandidates(earliest, latest, timezone)
        : [];
      candidateCache.set(cacheKey, candidates);
    }
    const available = candidates.find((candidate) => {
      const startAt = candidate.getTime();
      const endAt = startAt + oneHourMs;
      return reservations.every((reservation) => !overlap(startAt, endAt, reservation.startAt, reservation.endAt));
    });

    if (!available) {
      unscheduledSeries.push({ seriesId: entry.id, reason: 'NO_AVAILABLE_ONE_HOUR_WINDOW' });
      continue;
    }

    const startAt = available.getTime();
    const endAt = startAt + oneHourMs;
    const appointment: AutomaticSeriesAppointment = {
      seriesId: entry.id,
      phaseId: entry.phaseId,
      playerIds: [...entry.playerIds],
      scheduleKey: `${entry.id}:automatic-series-window`,
      checkInOpensAt: new Date(startAt - oneHourMs).toISOString(),
      checkInClosesAt: new Date(startAt - 30 * 60 * 1000).toISOString(),
      matchWindowStartAt: new Date(startAt).toISOString(),
      matchWindowEndAt: new Date(endAt).toISOString(),
      resultsDeadlineAt: new Date(startAt + 90 * 60 * 1000).toISOString(),
      timezone,
      gameNumbers: [1, 2, 3],
    };
    scheduledSeries.push(appointment);
    reservations.push({ seriesId: entry.id, playerIds: entry.playerIds, startAt, endAt });
  }

  const validation = validateSeriesSchedule({
    automatic: true,
    competitionTimezone: timezone,
    seasonStartAt: input.seasonStartAt,
    seasonEndAt: input.seasonEndAt,
    phases: input.phases,
    series: input.series,
    appointments: scheduledSeries,
  });

  return {
    feasible: unscheduledSeries.length === 0 && validation.canLock,
    scheduledSeries,
    unscheduledSeries,
    validation,
    capacity,
  };
}

export type SeriesOperationalState = {
  serverTime: string;
  timezone: string;
  checkIn: 'NOT_OPEN' | 'OPEN' | 'CLOSED';
  matchWindow: 'UPCOMING' | 'ACTIVE' | 'CLOSED';
  results: 'NOT_OPEN' | 'OPEN' | 'CLOSED';
};

export type SeriesScheduledWindow = Omit<
  Pick<
    AutomaticSeriesAppointment,
    | 'seriesId'
    | 'phaseId'
    | 'playerIds'
    | 'checkInOpensAt'
    | 'checkInClosesAt'
    | 'matchWindowStartAt'
    | 'matchWindowEndAt'
    | 'resultsDeadlineAt'
    | 'timezone'
    | 'gameNumbers'
  >,
  'checkInOpensAt' | 'checkInClosesAt' | 'matchWindowStartAt' | 'matchWindowEndAt' | 'resultsDeadlineAt'
> & {
  checkInOpensAt: Date | string;
  checkInClosesAt: Date | string;
  matchWindowStartAt: Date | string;
  matchWindowEndAt: Date | string;
  resultsDeadlineAt: Date | string;
};

function validateSeriesScheduledWindow(appointment: SeriesScheduledWindow): {
  checkInOpensAt: number;
  checkInClosesAt: number;
  matchWindowStartAt: number;
  matchWindowEndAt: number;
  resultsDeadlineAt: number;
} {
  if (!appointment.seriesId || !appointment.phaseId || !appointment.timezone.trim()) {
    throw new Error('A scheduled Series requires identity, Phase, and timezone');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: appointment.timezone });
  } catch {
    throw new Error('Series appointment timezone is invalid');
  }
  if (appointment.gameNumbers.length !== 3 || appointment.gameNumbers.some((gameNumber, index) => gameNumber !== index + 1)) {
    throw new Error('A scheduled Series must contain Games 1, 2, and 3');
  }

  const times = {
    checkInOpensAt: new Date(appointment.checkInOpensAt).getTime(),
    checkInClosesAt: new Date(appointment.checkInClosesAt).getTime(),
    matchWindowStartAt: new Date(appointment.matchWindowStartAt).getTime(),
    matchWindowEndAt: new Date(appointment.matchWindowEndAt).getTime(),
    resultsDeadlineAt: new Date(appointment.resultsDeadlineAt).getTime(),
  };
  if (Object.values(times).some((timestamp) => !Number.isFinite(timestamp))) {
    throw new Error('Series appointment timestamps must be valid');
  }
  if (
    times.matchWindowStartAt - times.checkInOpensAt !== 60 * 60 * 1000
    || times.matchWindowStartAt - times.checkInClosesAt !== 30 * 60 * 1000
    || times.matchWindowEndAt - times.matchWindowStartAt !== 60 * 60 * 1000
    || times.resultsDeadlineAt - times.matchWindowStartAt !== 90 * 60 * 1000
  ) {
    throw new Error('Series appointment timeline does not match the canonical offsets');
  }
  return times;
}

export function deriveSeriesOperationalState(
  appointment: SeriesScheduledWindow,
  serverTime: Date | string,
): SeriesOperationalState {
  const times = validateSeriesScheduledWindow(appointment);
  const serverNow = serverTime instanceof Date ? serverTime.getTime() : new Date(serverTime).getTime();
  if (!Number.isFinite(serverNow)) {
    throw new Error('Server time must be valid');
  }

  return {
    serverTime: new Date(serverNow).toISOString(),
    timezone: appointment.timezone,
    checkIn: serverNow < times.checkInOpensAt
      ? 'NOT_OPEN'
      : serverNow < times.checkInClosesAt
        ? 'OPEN'
        : 'CLOSED',
    matchWindow: serverNow < times.matchWindowStartAt
      ? 'UPCOMING'
      : serverNow < times.matchWindowEndAt
        ? 'ACTIVE'
        : 'CLOSED',
    results: serverNow < times.matchWindowStartAt
      ? 'NOT_OPEN'
      : serverNow < times.resultsDeadlineAt
        ? 'OPEN'
        : 'CLOSED',
  };
}

export function getSeriesOperationalState(appointment: SeriesScheduledWindow): SeriesOperationalState {
  return deriveSeriesOperationalState(appointment, new Date());
}

export function assertCheckInAllowed(appointment: SeriesScheduledWindow, serverTime: Date | string = new Date()): true {
  const state = deriveSeriesOperationalState(appointment, serverTime);
  if (state.checkIn === 'NOT_OPEN') {
    throw new Error('Series check-in is not open yet');
  }
  if (state.checkIn === 'CLOSED') {
    throw new Error('Series check-in is closed');
  }
  return true;
}

export function assertSeriesCanStart(input: {
  status: string;
  attendancePolicy: string;
  participantIds: string[];
  checkedInPlayerIds: string[];
  matchWindowStartAt: Date | string;
  matchWindowEndAt: Date | string;
  serverTime: Date | string;
}): true {
  if (input.status !== 'SCHEDULED') {
    throw new Error('Only a scheduled Series can start');
  }
  if (input.attendancePolicy !== 'BOTH_PARTICIPANTS_REQUIRED') {
    throw new Error('The Series attendance policy is not supported');
  }
  if (input.participantIds.length !== 2 || new Set(input.participantIds).size !== 2) {
    throw new Error('A Series requires exactly two distinct participants before it can start');
  }
  const checkedIn = new Set(input.checkedInPlayerIds);
  if (input.participantIds.some((playerId) => !checkedIn.has(playerId))) {
    throw new Error('Both participants must check in before a Series can start');
  }

  const startAt = new Date(input.matchWindowStartAt).getTime();
  const endAt = new Date(input.matchWindowEndAt).getTime();
  const serverNow = new Date(input.serverTime).getTime();
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt || !Number.isFinite(serverNow)) {
    throw new Error('Series Match Window timestamps must be valid');
  }
  if (serverNow < startAt || serverNow >= endAt) {
    throw new Error('A Series can only start during its active Match Window');
  }
  return true;
}

export function assertGameInActiveSeriesWindow(input: {
  appointment: SeriesScheduledWindow;
  activeSeriesId: string;
  game: { id: string; seriesId: string; gameNumber: number };
  serverTime?: Date | string;
}): true {
  const { appointment, activeSeriesId, game, serverTime = new Date() } = input;
  if (activeSeriesId !== appointment.seriesId || game.seriesId !== appointment.seriesId) {
    throw new Error('Game does not belong to the active Series');
  }
  if (!appointment.gameNumbers.includes(game.gameNumber as 1 | 2 | 3)) {
    throw new Error('Game is not part of the active Series');
  }
  if (deriveSeriesOperationalState(appointment, serverTime).matchWindow !== 'ACTIVE') {
    throw new Error('Game must be played during the active Series Match Window');
  }
  return true;
}

export function assertSeriesResultSubmissionAllowed(
  appointment: SeriesScheduledWindow,
  serverTime: Date | string = new Date(),
): true {
  const state = deriveSeriesOperationalState(appointment, serverTime);
  if (state.results === 'NOT_OPEN') {
    throw new Error('Series result submission is not open yet');
  }
  if (state.results === 'CLOSED') {
    throw new Error('Series result submission window is closed');
  }
  return true;
}

export type SeriesScheduleErrorCode =
  | 'PARTICIPANT_DOUBLE_BOOKING'
  | 'OVERLAPPING_SERIES'
  | 'INVALID_MATCH_WINDOW'
  | 'INVALID_CHECK_IN_WINDOW'
  | 'INVALID_RESULTS_DEADLINE'
  | 'INVALID_TIMEZONE'
  | 'TIMEZONE_MISMATCH'
  | 'DUPLICATE_APPOINTMENT'
  | 'WRONG_PHASE_ASSIGNMENT'
  | 'INCOMPLETE_SERIES_SCHEDULE'
  | 'OUTSIDE_SEASON_BOUNDARIES'
  | 'OUTSIDE_PHASE_BOUNDARIES'
  | 'SUNDAY_AUTOMATIC_SCHEDULE'
  | 'UNKNOWN_SERIES'
  | 'PARTICIPANT_MISMATCH';

export interface SeriesScheduleIssue {
  code: SeriesScheduleErrorCode;
  seriesId: string;
  message: string;
}

export interface SeriesScheduleAppointmentInput {
  seriesId?: string;
  phaseId?: string;
  playerIds?: string[];
  scheduleKey?: string | null;
  checkInOpensAt?: Date | string | null;
  checkInClosesAt?: Date | string | null;
  matchWindowStartAt?: Date | string | null;
  matchWindowEndAt?: Date | string | null;
  resultsDeadlineAt?: Date | string | null;
  timezone?: string | null;
  gameNumbers?: number[];
}

export interface SeriesScheduleValidationInput {
  automatic: boolean;
  competitionTimezone: string;
  seasonStartAt: Date | string;
  seasonEndAt: Date | string;
  phases: Array<{ id: string; phaseType?: 'QUALIFYING' | 'PLAYOFF' | 'FINAL' | 'CUSTOM'; startAt: Date | string; endAt: Date | string }>;
  series: Array<{ id: string; phaseId: string; playerIds: string[] }>;
  appointments: SeriesScheduleAppointmentInput[];
}

export interface SeriesScheduleValidationReport {
  valid: boolean;
  canLock: boolean;
  errors: SeriesScheduleIssue[];
  blockers: SeriesScheduleIssue[];
  warnings: SeriesScheduleIssue[];
}

function toScheduleTimestamp(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function overlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

export function validateSeriesSchedule(input: SeriesScheduleValidationInput): SeriesScheduleValidationReport {
  const errors: SeriesScheduleIssue[] = [];
  const warnings: SeriesScheduleIssue[] = [];
  const addError = (code: SeriesScheduleErrorCode, seriesId: string, message: string) => {
    errors.push({ code, seriesId, message });
  };
  const configuredTimezone = input.competitionTimezone?.trim() ?? '';
  let configuredTimezoneValid = Boolean(configuredTimezone);
  if (configuredTimezoneValid) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: configuredTimezone });
    } catch {
      configuredTimezoneValid = false;
    }
  }

  const seasonStart = toScheduleTimestamp(input.seasonStartAt);
  const seasonEnd = toScheduleTimestamp(input.seasonEndAt);
  const seasonBoundsValid = seasonStart !== null && seasonEnd !== null && seasonEnd > seasonStart;
  const seriesById = new Map<string, SeriesScheduleValidationInput['series'][number]>();
  for (const series of input.series) {
    if (seriesById.has(series.id)) {
      addError('DUPLICATE_APPOINTMENT', series.id, `Series ${series.id} is listed more than once in the schedule input.`);
    } else {
      seriesById.set(series.id, series);
    }
  }

  const appointmentCounts = new Map<string, number>();
  const appointmentsBySeries = new Map<string, SeriesScheduleAppointmentInput[]>();
  const seenScheduleKeys = new Set<string>();
  const seenAppointmentIdentities = new Set<string>();
  const validIntervals: Array<{
    seriesId: string;
    playerIds: string[];
    startAt: number;
    endAt: number;
  }> = [];
  const phasesById = new Map(input.phases.map((phase) => [phase.id, phase]));

  for (const appointment of input.appointments) {
    const seriesId = appointment.seriesId?.trim() || 'unknown-series';
    if (!appointment.seriesId || !seriesById.has(seriesId)) {
      addError('UNKNOWN_SERIES', seriesId, `Appointment references unknown Series ${seriesId}.`);
      continue;
    }
    const canonicalSeries = seriesById.get(seriesId)!;
    appointmentCounts.set(seriesId, (appointmentCounts.get(seriesId) ?? 0) + 1);
    const seriesAppointments = appointmentsBySeries.get(seriesId) ?? [];
    seriesAppointments.push(appointment);
    appointmentsBySeries.set(seriesId, seriesAppointments);

    if (appointmentCounts.get(seriesId)! > 1) {
      addError('DUPLICATE_APPOINTMENT', seriesId, `Series ${seriesId} has more than one appointment.`);
    }
    if (!appointment.scheduleKey?.trim()) {
      addError('INCOMPLETE_SERIES_SCHEDULE', seriesId, `Series ${seriesId} is missing its stable schedule key.`);
    } else if (seenScheduleKeys.has(appointment.scheduleKey)) {
      addError('DUPLICATE_APPOINTMENT', seriesId, `Schedule key ${appointment.scheduleKey} is assigned more than once.`);
    } else {
      seenScheduleKeys.add(appointment.scheduleKey);
    }

    if (!appointment.phaseId || appointment.phaseId !== canonicalSeries.phaseId || !phasesById.has(appointment.phaseId)) {
      addError('WRONG_PHASE_ASSIGNMENT', seriesId, `Appointment for Series ${seriesId} does not match its assigned Phase.`);
    }
    if (!Array.isArray(appointment.playerIds) || appointment.playerIds.length !== 2
      || new Set(appointment.playerIds).size !== 2 || appointment.playerIds.some((playerId) => !playerId?.trim())) {
      addError('INCOMPLETE_SERIES_SCHEDULE', seriesId, `Series ${seriesId} must schedule exactly two distinct participants.`);
    } else if (
      appointment.playerIds.length !== canonicalSeries.playerIds.length
      || canonicalSeries.playerIds.some((playerId) => !appointment.playerIds?.includes(playerId))
    ) {
      addError('PARTICIPANT_MISMATCH', seriesId, `Appointment participants do not match Series ${seriesId}.`);
    }
    if (!Array.isArray(appointment.gameNumbers)
      || appointment.gameNumbers.length !== 3
      || appointment.gameNumbers.some((gameNumber, index) => gameNumber !== index + 1)) {
      addError('INCOMPLETE_SERIES_SCHEDULE', seriesId, `Series ${seriesId} must schedule Games 1, 2, and 3.`);
    }

    const requiredTimes = [
      appointment.checkInOpensAt,
      appointment.checkInClosesAt,
      appointment.matchWindowStartAt,
      appointment.matchWindowEndAt,
      appointment.resultsDeadlineAt,
    ];
    const parsedTimes = requiredTimes.map(toScheduleTimestamp);
    if (parsedTimes.some((timestamp) => timestamp === null)) {
      addError('INCOMPLETE_SERIES_SCHEDULE', seriesId, `Series ${seriesId} is missing valid appointment timestamps.`);
      continue;
    }
    const [checkInOpensAt, checkInClosesAt, matchWindowStartAt, matchWindowEndAt, resultsDeadlineAt] = parsedTimes as number[];
    const timelineValid = matchWindowStartAt - checkInOpensAt === 60 * 60 * 1000
      && matchWindowStartAt - checkInClosesAt === 30 * 60 * 1000
      && matchWindowEndAt - matchWindowStartAt === 60 * 60 * 1000
      && resultsDeadlineAt - matchWindowStartAt === 90 * 60 * 1000;
    if (!timelineValid) {
      if (matchWindowEndAt - matchWindowStartAt !== 60 * 60 * 1000) {
        addError('INVALID_MATCH_WINDOW', seriesId, `Series ${seriesId} Match Window must last exactly 60 minutes.`);
      }
      if (matchWindowStartAt - checkInOpensAt !== 60 * 60 * 1000
        || matchWindowStartAt - checkInClosesAt !== 30 * 60 * 1000) {
        addError('INVALID_CHECK_IN_WINDOW', seriesId, `Series ${seriesId} check-in must open at T-60 and close at T-30.`);
      }
      if (resultsDeadlineAt - matchWindowStartAt !== 90 * 60 * 1000) {
        addError('INVALID_RESULTS_DEADLINE', seriesId, `Series ${seriesId} results deadline must be T+90.`);
      }
    }

    const timezone = appointment.timezone?.trim() ?? '';
    let appointmentTimezoneValid = Boolean(timezone);
    if (appointmentTimezoneValid) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      } catch {
        appointmentTimezoneValid = false;
      }
    }
    if (!appointmentTimezoneValid || !configuredTimezoneValid) {
      addError('INVALID_TIMEZONE', seriesId, `Series ${seriesId} uses an invalid timezone.`);
    } else if (timezone !== configuredTimezone) {
      addError('TIMEZONE_MISMATCH', seriesId, `Series ${seriesId} must use configured timezone ${configuredTimezone}.`);
    }

    if (appointmentTimezoneValid) {
      const localStart = getZonedDateTimeParts(new Date(matchWindowStartAt), timezone);
      const localEnd = getZonedDateTimeParts(new Date(matchWindowEndAt), timezone);
      const startMinutes = localStart.hour * 60 + localStart.minute;
      const endMinutes = localEnd.hour * 60 + localEnd.minute;
      if (startMinutes < 10 * 60 || endMinutes > 22 * 60) {
        addError('INVALID_MATCH_WINDOW', seriesId, `Series ${seriesId} Match Window must fall within 10:00–22:00 local time.`);
      }
      if (input.automatic && localStart.weekday === 'Sunday') {
        addError('SUNDAY_AUTOMATIC_SCHEDULE', seriesId, `Series ${seriesId} cannot be automatically scheduled on Sunday.`);
      }
    }

    if (seasonBoundsValid && seasonStart !== null && seasonEnd !== null && (matchWindowStartAt < seasonStart || matchWindowEndAt > seasonEnd)) {
      addError('OUTSIDE_SEASON_BOUNDARIES', seriesId, `Series ${seriesId} Match Window falls outside the Season.`);
    }
    const phase = appointment.phaseId ? phasesById.get(appointment.phaseId) : undefined;
    if (phase) {
      const phaseStartAt = toScheduleTimestamp(phase.startAt);
      const phaseEndAt = toScheduleTimestamp(phase.endAt);
      if (phaseStartAt === null || phaseEndAt === null
        || matchWindowStartAt < phaseStartAt || matchWindowEndAt > phaseEndAt) {
        addError('OUTSIDE_PHASE_BOUNDARIES', seriesId, `Series ${seriesId} Match Window falls outside Phase ${phase.id}.`);
      }
      if (phase.phaseType === 'FINAL' && seasonEnd !== null) {
        const finalWeekStart = new Date(seasonEnd);
        finalWeekStart.setUTCDate(finalWeekStart.getUTCDate() - 7);
        if (matchWindowStartAt < finalWeekStart.getTime() || matchWindowEndAt > seasonEnd) {
          addError('OUTSIDE_PHASE_BOUNDARIES', seriesId, 'Final Phase Match Window must remain inside the protected final week and before the Season end.');
        }
      }
    }

    const appointmentIdentity = `${seriesId}:${matchWindowStartAt}:${matchWindowEndAt}`;
    if (seenAppointmentIdentities.has(appointmentIdentity)) {
      addError('DUPLICATE_APPOINTMENT', seriesId, `Series ${seriesId} has a duplicate appointment at the same time.`);
    }
    seenAppointmentIdentities.add(appointmentIdentity);
    validIntervals.push({
      seriesId,
      playerIds: appointment.playerIds ?? [],
      startAt: matchWindowStartAt,
      endAt: matchWindowEndAt,
    });
  }

  for (const series of input.series) {
    if (!appointmentCounts.has(series.id)) {
      addError('INCOMPLETE_SERIES_SCHEDULE', series.id, `Series ${series.id} has no appointment.`);
    }
  }

  for (let index = 0; index < validIntervals.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < validIntervals.length; otherIndex += 1) {
      const current = validIntervals[index];
      const other = validIntervals[otherIndex];
      if (current.seriesId === other.seriesId || !overlap(current.startAt, current.endAt, other.startAt, other.endAt)) continue;
      addError('OVERLAPPING_SERIES', current.seriesId, `Series ${current.seriesId} overlaps Series ${other.seriesId}.`);
      addError('OVERLAPPING_SERIES', other.seriesId, `Series ${other.seriesId} overlaps Series ${current.seriesId}.`);
      if (current.playerIds.some((playerId) => other.playerIds.includes(playerId))) {
        addError('PARTICIPANT_DOUBLE_BOOKING', current.seriesId, `A participant is double-booked between Series ${current.seriesId} and ${other.seriesId}.`);
        addError('PARTICIPANT_DOUBLE_BOOKING', other.seriesId, `A participant is double-booked between Series ${other.seriesId} and ${current.seriesId}.`);
      }
    }
  }

  const deterministicErrors = Array.from(
    new Map(errors.map((error) => [`${error.seriesId}:${error.code}:${error.message}`, error])).values(),
  ).sort((left, right) => left.seriesId.localeCompare(right.seriesId)
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message));
  const deterministicWarnings = warnings.sort((left, right) => left.seriesId.localeCompare(right.seriesId)
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message));
  const valid = deterministicErrors.length === 0;
  return {
    valid,
    canLock: valid,
    errors: deterministicErrors,
    blockers: deterministicErrors,
    warnings: deterministicWarnings,
  };
}

export function assertSeriesScheduleCanLock(
  input: SeriesScheduleValidationInput | SeriesScheduleValidationReport,
): true {
  const report = 'errors' in input ? input : validateSeriesSchedule(input);
  if (!report.canLock || report.errors.length > 0) {
    const details = report.errors.map((error) => `${error.seriesId}: ${error.message}`).join(' ');
    throw new Error(`Series schedule cannot be locked while hard errors remain. ${details}`);
  }
  return true;
}

export function adjustSeriesAppointment(input: {
  input: SeriesScheduleValidationInput;
  seriesId: string;
  matchWindowStartAt: Date | string;
}): { appointment: AutomaticSeriesAppointment; validation: SeriesScheduleValidationReport } {
  const existing = input.input.appointments.find((appointment) => appointment.seriesId === input.seriesId);
  if (!existing) {
    throw new Error(`Series ${input.seriesId} has no appointment to adjust.`);
  }
  const timestamp = toScheduleTimestamp(input.matchWindowStartAt);
  if (timestamp === null) {
    throw new Error(`Series ${input.seriesId} adjustment time is invalid.`);
  }
  const matchWindowStartAt = new Date(timestamp);
  const appointment: AutomaticSeriesAppointment = {
    seriesId: input.seriesId,
    phaseId: existing.phaseId ?? '',
    playerIds: existing.playerIds ?? [],
    scheduleKey: existing.scheduleKey ?? `${input.seriesId}:manual-series-window`,
    checkInOpensAt: new Date(timestamp - 60 * 60 * 1000).toISOString(),
    checkInClosesAt: new Date(timestamp - 30 * 60 * 1000).toISOString(),
    matchWindowStartAt: matchWindowStartAt.toISOString(),
    matchWindowEndAt: new Date(timestamp + 60 * 60 * 1000).toISOString(),
    resultsDeadlineAt: new Date(timestamp + 90 * 60 * 1000).toISOString(),
    timezone: existing.timezone ?? input.input.competitionTimezone,
    gameNumbers: [1, 2, 3],
  };
  const appointments = input.input.appointments.map((entry) => entry.seriesId === input.seriesId ? appointment : entry);
  const validation = validateSeriesSchedule({ ...input.input, appointments });
  const affectedErrors = validation.errors.filter((error) => error.seriesId === input.seriesId);
  if (affectedErrors.length > 0) {
    const details = affectedErrors.map((error) => error.message).join(' ');
    throw new Error(`Series ${input.seriesId} adjustment failed validation. ${details}`);
  }
  return { appointment, validation };
}

export interface CapacityPhaseWorkload {
  phaseNumber: number;
  seriesCount: number;
  participantIdsBySeries?: string[][];
}

export interface SeasonCapacityInput {
  seasonStartAt: Date | string;
  seasonEndAt: Date | string;
  currentDate: Date | string;
  competitionTimezone: string;
  currentPhaseNumber: number;
  remainingPhases: CapacityPhaseWorkload[];
  protectedFinalWeekDays?: number;
  availableSchedulingDays?: number[];
  dailySchedulingHours?: number;
  seriesDurationMinutes?: number;
  requiredTransitionHours?: number;
}

export interface PhaseCapacityEstimate {
  phaseNumber: number;
  seriesCount: number;
  participantConflictCount: number;
  requiredWorkHours: number;
  availableSchedulingSlots: number;
  startAt: string | null;
  endAt: string | null;
  durationMs: number;
  isFinalPhase: boolean;
}

export interface SeasonCapacityBlocker {
  phaseNumber: number | null;
  code: 'INVALID_CAPACITY_INPUT' | 'INSUFFICIENT_PHASE_CAPACITY' | 'INSUFFICIENT_FINAL_WEEK_CAPACITY';
  message: string;
}

export interface SeasonCapacityReport {
  feasible: boolean;
  blockers: SeasonCapacityBlocker[];
  seasonStartAt: string;
  seasonEndAt: string;
  currentDate: string;
  protectedFinalWeekStartAt: string;
  requiredTransitionHours: number;
  availableSchedulingDays: number[];
  dailySchedulingHours: number;
  seriesDurationMinutes: number;
  totalSeriesCount: number;
  totalParticipantConflictCount: number;
  phases: PhaseCapacityEstimate[];
}

function countParticipantConflicts(participantIdsBySeries: string[][] = []): number {
  let conflicts = 0;
  const participants = participantIdsBySeries.map((ids) => new Set(ids));
  for (let index = 0; index < participants.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < participants.length; otherIndex += 1) {
      if (Array.from(participants[index]).some((playerId) => participants[otherIndex].has(playerId))) {
        conflicts += 1;
      }
    }
  }
  return conflicts;
}

function getCapacityStartCandidates(input: {
  startAt: number;
  endAt: number;
  timezone: string;
  allowedDays: Set<number>;
  dailySchedulingHours: number;
  seriesDurationMinutes: number;
}): Date[] {
  const durationMs = input.seriesDurationMinutes * 60 * 1000;
  const generationEnd = input.endAt - Math.max(0, durationMs - 60 * 60 * 1000);
  return getAutomaticStartCandidates(input.startAt, generationEnd, input.timezone)
    .filter((candidate) => {
      const start = getZonedDateTimeParts(candidate, input.timezone);
      const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        .indexOf(start.weekday);
      const isoWeekday = weekday === 0 ? 7 : weekday;
      const end = getZonedDateTimeParts(new Date(candidate.getTime() + durationMs), input.timezone);
      const localStartMinutes = start.hour * 60 + start.minute;
      const localEndMinutes = end.hour * 60 + end.minute;
      return input.allowedDays.has(isoWeekday)
        && localStartMinutes >= 10 * 60
        && localEndMinutes <= Math.min(22 * 60, (10 + input.dailySchedulingHours) * 60)
        && candidate.getTime() + durationMs <= input.endAt;
    });
}

export function calculateSeasonCapacity(input: SeasonCapacityInput): SeasonCapacityReport {
  const timezone = input.competitionTimezone?.trim() ?? '';
  const seasonStart = toScheduleTimestamp(input.seasonStartAt);
  const seasonEnd = toScheduleTimestamp(input.seasonEndAt);
  const currentTime = toScheduleTimestamp(input.currentDate);
  const protectedDays = input.protectedFinalWeekDays ?? 7;
  const dailySchedulingHours = input.dailySchedulingHours ?? 12;
  const seriesDurationMinutes = input.seriesDurationMinutes ?? 60;
  const requiredTransitionHours = input.requiredTransitionHours ?? 24;
  const availableSchedulingDays = input.availableSchedulingDays ?? [1, 2, 3, 4, 5, 6];
  const blockers: SeasonCapacityBlocker[] = [];

  const block = (code: SeasonCapacityBlocker['code'], phaseNumber: number | null, message: string) => {
    blockers.push({ code, phaseNumber, message });
  };
  let timezoneValid = Boolean(timezone);
  if (timezoneValid) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      timezoneValid = false;
    }
  }
  if (!timezoneValid) block('INVALID_CAPACITY_INPUT', null, 'A valid competition timezone is required.');
  if (seasonStart === null || seasonEnd === null || seasonEnd <= seasonStart) {
    block('INVALID_CAPACITY_INPUT', null, 'Season start and end must be valid, increasing timestamps.');
  }
  if (currentTime === null) block('INVALID_CAPACITY_INPUT', null, 'Current date must be a valid timestamp.');
  if (!Number.isInteger(protectedDays) || protectedDays < 1 || protectedDays > 7) {
    block('INVALID_CAPACITY_INPUT', null, 'Final-week protection must be between one and seven days.');
  }
  if (!Number.isInteger(dailySchedulingHours) || dailySchedulingHours < 1 || dailySchedulingHours > 12) {
    block('INVALID_CAPACITY_INPUT', null, 'Daily scheduling hours must be between one and twelve.');
  }
  if (!Number.isInteger(seriesDurationMinutes) || seriesDurationMinutes < 1 || seriesDurationMinutes > 720) {
    block('INVALID_CAPACITY_INPUT', null, 'Series duration must be between one and 720 minutes.');
  }
  if (!Number.isFinite(requiredTransitionHours) || requiredTransitionHours < 0) {
    block('INVALID_CAPACITY_INPUT', null, 'Required transition time must be zero or greater.');
  }
  if (availableSchedulingDays.length === 0
    || availableSchedulingDays.some((day) => !Number.isInteger(day) || day < 1 || day > 6)
    || new Set(availableSchedulingDays).size !== availableSchedulingDays.length) {
    block('INVALID_CAPACITY_INPUT', null, 'Available scheduling days must be unique ISO weekdays from Monday through Saturday.');
  }
  if (input.remainingPhases.length === 0) {
    block('INVALID_CAPACITY_INPUT', null, 'At least one remaining Phase workload is required.');
  }
  for (let index = 0; index < input.remainingPhases.length; index += 1) {
    const phase = input.remainingPhases[index];
    if (!Number.isInteger(phase.phaseNumber) || phase.phaseNumber <= input.currentPhaseNumber
      || (index > 0 && phase.phaseNumber !== input.remainingPhases[index - 1].phaseNumber + 1)
      || !Number.isInteger(phase.seriesCount) || phase.seriesCount < 0) {
      block('INVALID_CAPACITY_INPUT', phase.phaseNumber, `Phase ${phase.phaseNumber} workload or sequence is invalid.`);
    }
    if (phase.participantIdsBySeries && phase.participantIdsBySeries.length !== phase.seriesCount) {
      block('INVALID_CAPACITY_INPUT', phase.phaseNumber, `Phase ${phase.phaseNumber} participant workload must match its Series count.`);
    }
  }

  const safeSeasonStart = seasonStart ?? 0;
  const safeSeasonEnd = seasonEnd ?? 0;
  const safeCurrentTime = currentTime ?? safeSeasonStart;
  const safeProtectedDays = Number.isInteger(protectedDays) && protectedDays > 0 && protectedDays <= 7 ? protectedDays : 7;
  const protectedFinalWeekStart = Math.max(
    safeSeasonStart,
    safeSeasonEnd - safeProtectedDays * 24 * 60 * 60 * 1000,
  );
  const allowedDays = new Set(availableSchedulingDays.filter((day) => Number.isInteger(day) && day >= 1 && day <= 6));
  const validSchedulingParameters = timezoneValid
    && Number.isInteger(dailySchedulingHours) && dailySchedulingHours >= 1 && dailySchedulingHours <= 12
    && Number.isInteger(seriesDurationMinutes) && seriesDurationMinutes >= 1 && seriesDurationMinutes <= 720
    && allowedDays.size > 0;
  const phaseEstimates: PhaseCapacityEstimate[] = [];
  let cursor = Math.max(safeSeasonStart, safeCurrentTime);
  const transitionCount = Math.max(0, input.remainingPhases.length - 1);

  input.remainingPhases.forEach((phase, index) => {
    const isFinalPhase = index === input.remainingPhases.length - 1;
    const earliest = isFinalPhase ? Math.max(cursor, protectedFinalWeekStart) : cursor;
    const latest = isFinalPhase ? safeSeasonEnd : protectedFinalWeekStart;
    const candidates = validSchedulingParameters && latest > earliest
      ? getCapacityStartCandidates({
          startAt: earliest,
          endAt: latest,
          timezone,
          allowedDays,
          dailySchedulingHours,
          seriesDurationMinutes,
        })
      : [];
    const selected = candidates.slice(0, Math.max(0, phase.seriesCount));
    const hasEnoughSlots = selected.length === phase.seriesCount;
    if (!hasEnoughSlots && phase.seriesCount > 0) {
      block(
        isFinalPhase ? 'INSUFFICIENT_FINAL_WEEK_CAPACITY' : 'INSUFFICIENT_PHASE_CAPACITY',
        phase.phaseNumber,
        isFinalPhase
          ? `Final Phase ${phase.phaseNumber} requires ${phase.seriesCount} Series but only ${candidates.length} legal windows fit in the protected final week.`
          : `Phase ${phase.phaseNumber} requires ${phase.seriesCount} Series but only ${candidates.length} legal windows remain before the final week.`,
      );
    }
    const phaseStart = hasEnoughSlots && selected.length > 0 ? selected[0].getTime() : null;
    const phaseEnd = hasEnoughSlots && selected.length > 0
      ? selected[selected.length - 1].getTime() + seriesDurationMinutes * 60 * 1000
      : null;
    const durationMs = phaseStart !== null && phaseEnd !== null ? phaseEnd - phaseStart : 0;
    const participantConflictCount = countParticipantConflicts(phase.participantIdsBySeries);
    phaseEstimates.push({
      phaseNumber: phase.phaseNumber,
      seriesCount: phase.seriesCount,
      participantConflictCount,
      requiredWorkHours: phase.seriesCount * seriesDurationMinutes / 60,
      availableSchedulingSlots: candidates.length,
      startAt: phaseStart === null ? null : new Date(phaseStart).toISOString(),
      endAt: phaseEnd === null ? null : new Date(phaseEnd).toISOString(),
      durationMs,
      isFinalPhase,
    });
    if (phaseEnd !== null) {
      cursor = phaseEnd;
    }
    if (index < input.remainingPhases.length - 1) {
      cursor += requiredTransitionHours * 60 * 60 * 1000;
    }
  });

  const totalSeriesCount = input.remainingPhases.reduce((sum, phase) => sum + phase.seriesCount, 0);
  const totalParticipantConflictCount = phaseEstimates.reduce((sum, phase) => sum + phase.participantConflictCount, 0);
  const deterministicBlockers = Array.from(
    new Map(blockers.map((blocker) => [`${blocker.phaseNumber}:${blocker.code}:${blocker.message}`, blocker])).values(),
  ).sort((left, right) => (left.phaseNumber ?? 0) - (right.phaseNumber ?? 0) || left.code.localeCompare(right.code));

  return {
    feasible: deterministicBlockers.length === 0,
    blockers: deterministicBlockers,
    seasonStartAt: seasonStart === null ? '' : new Date(seasonStart).toISOString(),
    seasonEndAt: seasonEnd === null ? '' : new Date(seasonEnd).toISOString(),
    currentDate: currentTime === null ? '' : new Date(currentTime).toISOString(),
    protectedFinalWeekStartAt: new Date(protectedFinalWeekStart).toISOString(),
    requiredTransitionHours: transitionCount * requiredTransitionHours,
    availableSchedulingDays: Array.from(allowedDays).sort((left, right) => left - right),
    dailySchedulingHours,
    seriesDurationMinutes,
    totalSeriesCount,
    totalParticipantConflictCount,
    phases: phaseEstimates,
  };
}

export function estimateSeriesCountsForPlayerField(playerCount: number): CapacityPhaseWorkload[] {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new Error('Player count must be a positive integer');
  }

  const workloads: CapacityPhaseWorkload[] = [];
  let players = playerCount;
  let previousPlotCount: number | undefined;
  let phaseNumber = 1;

  while (players > 1) {
    const plotCount = previousPlotCount === undefined
      ? calculateInitialPlotCount(players)
      : calculateLaterPlotCount(previousPlotCount, players);
    const basePlotSize = Math.floor(players / plotCount);
    const largerPlotCount = players % plotCount;
    let seriesCount = 0;
    for (let plotIndex = 0; plotIndex < plotCount; plotIndex += 1) {
      const plotSize = basePlotSize + (plotIndex < largerPlotCount ? 1 : 0);
      seriesCount += plotSize * (plotSize - 1) / 2;
    }
    workloads.push({ phaseNumber, seriesCount });
    previousPlotCount = plotCount;
    players = Math.max(1, Math.ceil(players / 2));
    phaseNumber += 1;
  }

  workloads.push({ phaseNumber, seriesCount: 0 });
  return workloads;
}
