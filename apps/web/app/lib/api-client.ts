import type { ApiEnvelope } from '@nexgen/shared';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export type UserProfile = {
  id: string;
  email: string;
  roles?: string[];
};

export type StandingsRow = {
  team: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
};

export type LeaderboardsResponse = {
  players: Array<{ id: string; name: string; score: number }>;
  clubs: Array<{ id: string; name: string; score: number }>;
};

export type ClubMemberSummary = {
  id: string;
  user_id: string;
  role: string;
  status: string;
};

export type ClubSummary = {
  id: string;
  name: string;
  tag?: string;
  region?: string;
  description?: string;
  status: string;
  members: ClubMemberSummary[];
};

export type PlayerProfile = {
  id: string;
  gamer_tag: string;
  region?: string;
  verification_status: string;
  player_status: string;
  reputation_score: number;
  wins: number;
  losses: number;
  draws: number;
  goals: number;
  no_shows: number;
  mvp_count: number;
  classification: string;
  created_at: string;
  updated_at: string;
};

export type CreateClubInput = {
  name: string;
  tag: string;
  region?: string;
  description?: string;
};

export type CreateClubResponse = {
  club: {
    id: string;
    name: string;
    status: string;
  };
  application: {
    id: string;
    status: string;
  };
};

export type PlayerProfileUpdateInput = {
  gamerTag?: string;
  region?: string;
  metadata?: Record<string, unknown>;
};

export type PlayerProfileUpdateResponse = PlayerProfile;

export type ClubCreateResponse = CreateClubResponse;

export type PlayerProfileResponse = PlayerProfile;

export type ClubApplicationSummary = {
  id: string;
  status: string;
  note?: string | null;
  submitted_at: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
  club: {
    id: string;
    name: string;
  };
};

export type RecruitmentProfile = {
  id: string;
  gamer_tag: string;
  region?: string;
  classification: string;
  player_status: string;
  verification_status: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
};

export type MatchSummary = {
  id: string;
  homeClub: string;
  awayClub: string;
  scheduledAt: string;
  status: string;
};

/**
 * Canonical browser API client.
 *
 * Authentication is cookie-based. The browser never reads or stores
 * accessToken or refreshToken.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | {
        success?: boolean;
        error?: {
          message?: string;
        };
      }
    | null;

  if (!response.ok) {
    throw new Error(
      payload &&
        'error' in payload &&
        payload.error?.message
        ? payload.error.message
        : 'API request failed',
    );
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !('success' in payload) ||
    payload.success !== true ||
    !('data' in payload)
  ) {
    throw new Error('Invalid API response');
  }

  return payload.data;
}

export async function getUserMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>(
    `/users/me`,
    {
      cache: 'no-store',
    },
  );
}

export async function getLeaderboards(): Promise<LeaderboardsResponse> {
  return apiFetch<LeaderboardsResponse>(
    `/standings/leaderboards`,
    {
      cache: 'no-store',
    },
  );
}

export async function listMatches(): Promise<MatchSummary[]> {
  return apiFetch<MatchSummary[]>(
    `/matches`,
    {
      cache: 'no-store',
    },
  );
}

export async function getMyPlayerProfile(): Promise<PlayerProfileResponse> {
  return apiFetch<PlayerProfileResponse>(
    `/players/me/profile`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  );
}

export async function updateMyPlayerProfile(
  payload: PlayerProfileUpdateInput,
): Promise<PlayerProfileUpdateResponse> {
  return apiFetch<PlayerProfileUpdateResponse>(
    `/players/me/profile`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export async function createClub(
  dto: CreateClubInput,
): Promise<ClubCreateResponse> {
  return apiFetch<ClubCreateResponse>(
    `/clubs`,
    {
      method: 'POST',
      body: JSON.stringify(dto),
    },
  );
}

export async function applyToClub(
  clubId: string,
): Promise<{ id: string; status: string }> {
  return apiFetch<{ id: string; status: string }>(
    `/clubs/${clubId}/applications`,
    {
      method: 'POST',
    },
  );
}

export async function listClubApplications(
  clubId: string,
): Promise<ClubApplicationSummary[]> {
  return apiFetch<ClubApplicationSummary[]>(
    `/clubs/${clubId}/applications`,
    {
      cache: 'no-store',
    },
  );
}

export async function approveClubApplication(
  applicationId: string,
): Promise<unknown> {
  return apiFetch<unknown>(
    `/clubs/applications/${applicationId}/approve`,
    {
      method: 'POST',
    },
  );
}

export async function rejectClubApplication(
  applicationId: string,
): Promise<unknown> {
  return apiFetch<unknown>(
    `/clubs/applications/${applicationId}/reject`,
    {
      method: 'POST',
    },
  );
}

export async function removeClubMember(
  clubId: string,
  memberUserId: string,
): Promise<unknown> {
  return apiFetch<unknown>(
    `/clubs/${clubId}/members/${memberUserId}`,
    {
      method: 'DELETE',
    },
  );
}

export async function updateClubMemberStatus(
  clubId: string,
  memberUserId: string,
  status: string,
): Promise<unknown> {
  return apiFetch<unknown>(
    `//clubs/${clubId}/members/${memberUserId}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  );
}

export async function listRecruitmentPool(
  params: { division?: string; region?: string } = {},
): Promise<RecruitmentProfile[]> {
  const searchParams = new URLSearchParams();

  if (params.division) {
    searchParams.set('division', params.division);
  }

  if (params.region) {
    searchParams.set('region', params.region);
  }

  const query = searchParams.toString();

  return apiFetch<RecruitmentProfile[]>(
    `/players/recruitment-pool${query ? `?${query}` : ''}`,
    {
      cache: 'no-store',
    },
  );
}

export async function listClubs(): Promise<ClubSummary[]> {
  return apiFetch<ClubSummary[]>(
    `/clubs`,
    {
      cache: 'no-store',
    },
  );
}

export type SeasonSummary = {
  id: string;
  description?: string | null;
  league?: { id: string; name: string; status: string };
  league_id?: string;
  name: string;
  status: string;
  start_date?: string;
  end_date?: string;
  registration_open_at?: string;
  registration_close_at?: string;
  divisions?: Array<{
    id: string;
    name: string;
    type: string;
    capacity: number;
    active: boolean;
  }>;
};

export type CompetitionRulesDocument = {
  competitionStructure: Record<string, unknown>;
  phasePlotRules: Record<string, unknown>;
  seriesGameRules: Record<string, unknown>;
  drawRules: Record<string, unknown>;
  advancement: Record<string, unknown>;
  scheduling: Record<string, unknown>;
  checkIn: Record<string, unknown>;
  results: Record<string, unknown>;
  disputes: Record<string, unknown>;
  penalties: Record<string, unknown>;
  conduct: Record<string, unknown>;
  participation: Record<string, unknown>;
  paymentFees: Record<string, unknown>;
};

export type CompetitionRulesetSummary = {
  id: string;
  name: string;
  version: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  rules_hash: string | null;
  published_at: string | null;
  supersedes_ruleset_id: string | null;
  created_at: string;
};

export type CompetitionRulesPreview = {
  id: string;
  status: 'DRAFT' | 'PUBLISHED';
  rules: CompetitionRulesDocument;
  rulesHash: string;
  playerFacing: { name: string; version: string; sections: Array<{ title: string; items: string[] }>; text: string };
};

export async function getDefaultCompetitionRules(): Promise<CompetitionRulesDocument> {
  return apiFetch<CompetitionRulesDocument>('/competition/rulesets/defaults', { cache: 'no-store' });
}

export async function listCompetitionRulesets(publishedOnly = false): Promise<CompetitionRulesetSummary[]> {
  return apiFetch<CompetitionRulesetSummary[]>(`/competition/rulesets${publishedOnly ? '?publishedOnly=true' : ''}`, { cache: 'no-store' });
}

export async function createCompetitionRuleset(input: {
  name: string; version: string; description?: string; rules: CompetitionRulesDocument; supersedesRulesetId?: string;
}): Promise<CompetitionRulesetSummary> {
  return apiFetch<CompetitionRulesetSummary>('/competition/rulesets', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateCompetitionRuleset(rulesetId: string, input: {
  name?: string; description?: string; rules?: CompetitionRulesDocument;
}): Promise<CompetitionRulesetSummary> {
  return apiFetch<CompetitionRulesetSummary>(`/competition/rulesets/${rulesetId}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function previewCompetitionRuleset(rulesetId: string): Promise<CompetitionRulesPreview> {
  return apiFetch<CompetitionRulesPreview>(`/competition/rulesets/${rulesetId}/preview`, { cache: 'no-store' });
}

export async function publishCompetitionRuleset(rulesetId: string): Promise<CompetitionRulesetSummary> {
  return apiFetch<CompetitionRulesetSummary>(`/competition/rulesets/${rulesetId}/publish`, { method: 'POST' });
}

export type SeasonOverview = SeasonSummary & {
  counts: { participants: number; divisions: number; fixtures: number; matches: number; pendingResults: number; disputes: number; penalties: number; confirmedMatches: number };
  ruleset: { id: string; name: string; version: string; status: string; publishedAt: string | null; rulesHash: string | null } | null;
  playerFacingRules: { name: string; version: string; sections: Array<{ title: string; items: string[] }>; text: string } | null;
  divisions: Array<{ id: string; name: string; type: string; format: string; capacity: number | null; active: boolean; _count: { participants: number; fixtures: number; matches: number; standings_rows: number } }>;
  nextAction: { label: string; endpoint: string; reason: string } | null;
  readiness: { canAdvance: boolean; issues: string[] };
};

export type DivisionFixtureSchedule = {
  divisionId: string;
  divisionName: string;
  active: boolean;
  format: string;
  registrationCapacity: number | null;
  competitionCapacity: number | null;
  configuredCompetitionParticipantCount: number | null;
  schedulingPeriodDays: number;
  matchesPerParticipant: number;
  schedulingPeriodCount: number;
  matchWindowStartMinutes: number | null;
  matchWindowEndMinutes: number | null;
  matchWindowTimezone: string;
  concurrentMatches: number;
  registrationCount: number;
  participantCount: number;
  expectedFixtureCount: number;
  currentFixtureCount: number;
  scheduledFixtureCount: number;
  unscheduledFixtureCount: number;
  roundCount: number;
  currentRound: number | null;
  conflictCount: number | null;
  scheduleLocked: boolean;
  scheduleValidationRequired: boolean;
  generationStatus: 'BLOCKED' | 'NOT_GENERATED' | 'GENERATED' | 'INCOMPLETE';
  validation: {
    valid: boolean;
    totalFixtures: number;
    fixturesPerParticipant: Array<{ participantId: string; fixtureCount: number }>;
    fixturesPerSchedulingPeriod: Array<{ periodNumber: number; fixtureCount: number }>;
    maximumFixturesPerParticipantPerPeriod: number;
    requiredConcurrentMatches: number;
    configuredConcurrentMatches: number;
    schedulingPeriodsRequired: number;
    errors: string[];
    densityWarnings: string[];
  } | null;
  blockers: string[];
  warnings: string[];
};

export type SeasonFixtureSchedule = {
  seasonId: string;
  seasonName: string;
  leagueName: string;
  seasonStatus: string;
  divisions: DivisionFixtureSchedule[];
};

export type CompetitionScheduleIssue = {
  code: string;
  seriesId: string;
  message: string;
};

export type CompetitionWorkspace = {
  serverTime: string;
  season: {
    id: string;
    name: string;
    leagueName: string;
    status: string;
    startAt: string | null;
    endAt: string | null;
    timezone: string;
  };
  currentPhaseId: string | null;
  summary: {
    phaseCount: number;
    plotCount: number;
    participantCount: number;
    seriesCount: number;
    completedSeriesCount: number;
    pendingSeriesCount: number;
    unresolvedSeriesCount: number;
    completedGameCount: number;
    gameCount: number;
    conflictCount: number;
  };
  validation: {
    valid: boolean;
    canLock: boolean;
    errors: CompetitionScheduleIssue[];
    blockers: CompetitionScheduleIssue[];
    warnings: CompetitionScheduleIssue[];
  };
  capacity: {
    feasible: boolean;
    blockers: Array<{ phaseNumber: number | null; code: string; message: string }>;
    protectedFinalWeekStartAt: string;
    phases: Array<{
      phaseNumber: number;
      seriesCount: number;
      durationMs: number;
      startAt: string | null;
      endAt: string | null;
      isFinalPhase: boolean;
    }>;
  } | null;
  phases: Array<{
    id: string;
    number: number;
    type: string;
    name: string;
    status: string;
    startAt: string | null;
    endAt: string | null;
    scheduleLocked: boolean;
    participantCount: number;
    progression: {
      phaseFinalized: boolean;
      participantCount: number;
      playedSeriesCount: number;
      pendingSeriesCount: number;
      gamesPlayedCount: number;
      survivors: string[];
      advancementEligiblePlayerIds: string[];
      participants: Array<{
        playerId: string;
        gamerTag: string;
        plotIds: string[];
        plotNames: string[];
        seriesPlayed: number;
        gamesPlayed: number;
        seriesWins: number;
        seriesLosses: number;
        eliminations: number;
        survivor: boolean;
        advancementEligible: boolean;
      }>;
    };
    plotCount: number;
    seriesCount: number;
    completedSeriesCount: number;
    pendingSeriesCount: number;
    completedGameCount: number;
    gameCount: number;
    advancementStatus: string;
    scheduleStatus: string;
    conflicts: number;
    validation: { valid: boolean; blockers: CompetitionScheduleIssue[] };
    plots: Array<{
      id: string;
      name: string;
      participantIds: string[];
      participantCount: number;
      series: Array<{
        id: string;
        number: number | null;
        status: string;
        playerIds: string[];
        matchWindowStartAt: string | null;
        matchWindowEndAt: string | null;
        checkInOpensAt: string | null;
        checkInClosesAt: string | null;
        resultsDeadlineAt: string | null;
        timezone: string | null;
        winnerPlayerId: string | null;
        eliminationOutcome: string | null;
        games: Array<{ id: string; number: number; status: string; result: string | null; winnerPlayerId: string | null }>;
        checkIn: {
          state: 'NOT_SCHEDULED' | 'NOT_OPEN' | 'OPEN' | 'CLOSED';
          opensAt: string | null;
          closesAt: string | null;
          canManageExceptions: boolean;
          exceptionAllowed: boolean;
          attendancePolicy: string;
          checkedInCount: number;
          participants: Array<{
            playerId: string;
            gamerTag: string;
            status: 'CHECKED_IN' | 'NOT_CHECKED_IN';
            checkedInAt: string | null;
            isException: boolean;
            exceptionReason: string | null;
          }>;
        };
        execution: { status: 'NOT_READY' | 'READY' | 'IN_PROGRESS'; canStart: boolean };
      }>;
    }>;
  }>;
};

export async function getCompetitionWorkspace(seasonId: string): Promise<CompetitionWorkspace> {
  return apiFetch<CompetitionWorkspace>(`/competition/seasons/${seasonId}/workspace`, { cache: 'no-store' });
}

export async function generateCompetitionSchedule(seasonId: string): Promise<unknown> {
  return apiFetch<unknown>(`/competition/seasons/${seasonId}/schedule/generate`, { method: 'POST' });
}

export async function adjustCompetitionSeriesSchedule(
  seriesId: string,
  input: { matchWindowStartAt: string; reason?: string },
): Promise<unknown> {
  return apiFetch<unknown>(`/competition/series/${seriesId}/schedule`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function validateCompetitionSchedule(seasonId: string): Promise<CompetitionWorkspace['validation']> {
  return apiFetch<CompetitionWorkspace['validation']>(`/competition/seasons/${seasonId}/schedule/validate`, { method: 'POST' });
}

export async function lockCompetitionSchedule(seasonId: string): Promise<{ scheduleLocked: boolean }> {
  return apiFetch<{ scheduleLocked: boolean }>(`/competition/seasons/${seasonId}/schedule/lock`, { method: 'POST' });
}

export async function recordCompetitionSeriesCheckIn(
  seriesId: string,
  playerId: string,
  input: { isException?: boolean; reason?: string; evidenceUrl?: string } = {},
): Promise<{ alreadyCheckedIn: boolean; checked_in_at: string; is_exception: boolean }> {
  return apiFetch<{ alreadyCheckedIn: boolean; checked_in_at: string; is_exception: boolean }>(`/competition/series/${seriesId}/check-ins/${playerId}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function startCompetitionSeries(seriesId: string): Promise<{ id: string; status: string }> {
  return apiFetch<{ id: string; status: string }>(`/competition/series/${seriesId}/start`, { method: 'POST' });
}

export type SeriesExecutionWorkspace = {
  serverTime: string;
  season: { id: string; name: string };
  phase: { id: string; number: number; name: string; status: string; scheduleLocked: boolean };
  plot: { id: string; name: string };
  series: {
    id: string;
    number: number | null;
    status: string;
    resultState: string;
    winnerPlayerId: string | null;
    winnerGamerTag: string | null;
    canComplete: boolean;
  };
  participants: Array<{ id: string; gamerTag: string; checkedIn: boolean }>;
  matchWindow: {
    startsAt: string | null;
    endsAt: string | null;
    timezone: string;
    state: string;
    remainingMs: number | null;
    resultSubmissionState: string;
  };
  checkIn: { state: string; opensAt: string | null; closesAt: string | null; checkedInCount: number; requiredCount: number };
  currentScore: { gameNumber: number; home: number; away: number } | null;
  seriesScore: { homeWins: number; awayWins: number; draws: number } | null;
  games: Array<{
    id: string;
    number: number;
    status: string;
    homePlayerId: string | null;
    homeGamerTag: string | null;
    awayPlayerId: string | null;
    awayGamerTag: string | null;
    homeScore: number;
    awayScore: number;
    result: string | null;
    verificationStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CORRECTION_REQUESTED' | 'OVERRIDDEN';
    verificationReason: string | null;
    winnerPlayerId: string | null;
    startedAt: string | null;
    completedAt: string | null;
    canStart: boolean;
    canUpdateScore: boolean;
    canRecordResult: boolean;
    canVerifyResult: boolean;
    canOverrideResult: boolean;
  }>;
};

export async function getSeriesExecutionWorkspace(seriesId: string): Promise<SeriesExecutionWorkspace> {
  return apiFetch<SeriesExecutionWorkspace>(`/competition/series/${seriesId}/execution`, { cache: 'no-store' });
}

export async function startCompetitionGame(seriesId: string, gameId: string): Promise<unknown> {
  return apiFetch(`/competition/series/${seriesId}/games/${gameId}/start`, { method: 'POST' });
}

export async function updateCompetitionGameScore(
  seriesId: string,
  gameId: string,
  input: { homeScore: number; awayScore: number },
): Promise<unknown> {
  return apiFetch(`/competition/series/${seriesId}/games/${gameId}/score`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function completeCompetitionGame(
  seriesId: string,
  gameId: string,
  input: { result: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' | 'UNRESOLVED'; homeScore: number; awayScore: number; reason?: string },
): Promise<unknown> {
  return apiFetch(`/competition/series/${seriesId}/games/${gameId}/complete`, { method: 'POST', body: JSON.stringify(input) });
}

export async function verifyCompetitionGameResult(
  seriesId: string,
  gameId: string,
  input: { status: 'APPROVED' | 'REJECTED' | 'CORRECTION_REQUESTED'; reason?: string },
): Promise<{ id: string; status: string; alreadyVerified: boolean }> {
  return apiFetch(`/competition/series/${seriesId}/games/${gameId}/verification`, { method: 'POST', body: JSON.stringify(input) });
}

export async function overrideCompetitionGameResult(
  seriesId: string,
  gameId: string,
  input: {
    result: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' | 'UNRESOLVED';
    homeScore: number;
    awayScore: number;
    reason: string;
    evidenceUrl?: string;
    reference?: string;
  },
): Promise<{ id: string; resultVersion: number; result: string; winnerPlayerId: string | null; verificationStatus: 'OVERRIDDEN' }> {
  return apiFetch(`/competition/series/${seriesId}/games/${gameId}/override`, { method: 'POST', body: JSON.stringify(input) });
}

export async function completeCompetitionSeries(seriesId: string): Promise<unknown> {
  return apiFetch(`/competition/series/${seriesId}/complete`, { method: 'POST' });
}

export type DivisionFixturePage = {
  divisionId: string;
  scheduleLocked: boolean;
  fixtures: Array<{
    id: string;
    fixtureNumber: number | null;
    scheduledAt: string | null;
    timezone: string | null;
    checkInOpensAt: string | null;
    checkInClosesAt: string | null;
    playWindowOpensAt: string | null;
    playWindowClosesAt: string | null;
    schedulingStatus: string;
    status: string;
    roundNumber: number | null;
    schedulingPeriodNumber: number | null;
    homePlayer: { id: string; gamerTag: string };
    awayPlayer: { id: string; gamerTag: string };
    matchStatus: string | null;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export async function createSeason(payload: { leagueId: string; rulesetId: string; name: string; description?: string; startDate: string; endDate: string; divisionName?: string; divisionType?: string; divisionFormat?: string; divisionCapacity?: number; registrationCapacity?: number; competitionParticipantCount?: number; schedulingPeriodDays?: number; matchesPerParticipant?: number; matchWindowStartMinutes?: number; matchWindowEndMinutes?: number; matchWindowTimezone?: string; concurrentMatches?: number }): Promise<SeasonSummary> {
  return apiFetch<SeasonSummary>('/seasons', { method: 'POST', body: JSON.stringify(payload) });
}

export async function listSeasons(): Promise<SeasonSummary[]> {
  return apiFetch<SeasonSummary[]>(
    `/seasons`,
    {
      cache: 'no-store',
    },
  );
}

export async function publishSeason(
  seasonId: string,
): Promise<SeasonSummary> {
  return apiFetch<SeasonSummary>(
    `/seasons/${seasonId}/publish`,
    {
      method: 'POST',
    },
  );
}

export async function closeSeasonRegistration(
  seasonId: string,
): Promise<SeasonSummary> {
  return apiFetch<SeasonSummary>(
    `/seasons/${seasonId}/close-registration`,
    {
      method: 'POST',
    },
  );
}

export async function activateSeason(
  seasonId: string,
): Promise<SeasonSummary> {
  return apiFetch<SeasonSummary>(
    `/seasons/${seasonId}/activate`,
    {
      method: 'POST',
    },
  );
}

export async function startSeasonPlayoffs(
  seasonId: string,
): Promise<SeasonSummary> {
  return apiFetch<SeasonSummary>(
    `/seasons/${seasonId}/start-playoffs`,
    {
      method: 'POST',
    },
  );
}

export async function completeSeason(
  seasonId: string,
): Promise<SeasonSummary> {
  return apiFetch<SeasonSummary>(
    `/seasons/${seasonId}/complete`,
    {
      method: 'POST',
    },
  );
}

export async function archiveSeason(
  seasonId: string,
): Promise<SeasonSummary> {
  return apiFetch<SeasonSummary>(
    `/seasons/${seasonId}/archive`,
    {
      method: 'POST',
    },
  );
}

export async function createDivision(
  seasonId: string,
  payload: {
    name: string;
    type?: string;
    format?: string;
    capacity?: number;
    registrationCapacity?: number;
    competitionParticipantCount?: number;
    schedulingPeriodDays?: number;
    matchesPerParticipant?: number;
    matchWindowStartMinutes?: number;
    matchWindowEndMinutes?: number;
    matchWindowTimezone?: string;
    concurrentMatches?: number;
    active?: boolean;
  },
) {
  return apiFetch<any>(
    `/seasons/${seasonId}/divisions`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function updateDivision(
  divisionId: string,
  payload: {
    name?: string;
    type?: string;
    format?: string;
    capacity?: number;
    registrationCapacity?: number | null;
    competitionParticipantCount?: number | null;
    schedulingPeriodDays?: number;
    matchesPerParticipant?: number;
    matchWindowStartMinutes?: number | null;
    matchWindowEndMinutes?: number | null;
    matchWindowTimezone?: string;
    concurrentMatches?: number;
    active?: boolean;
  },
) {
  return apiFetch<any>(
    `/seasons/divisions/${divisionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export async function deactivateDivision(
  divisionId: string,
) {
  return apiFetch<any>(
    `//seasons/divisions/${divisionId}`,
    {
      method: 'DELETE',
    },
  );
}

export async function getSeasonStandings(
  seasonId: string,
): Promise<{ seasonId: string; rows: StandingsRow[] }> {
  return apiFetch<{ seasonId: string; rows: StandingsRow[] }>(
    `/standings/seasons/${seasonId}`,
    {
      cache: 'no-store',
    },
  );
}

/**
 * Admin API operations belong here too.
 * auth-client.ts must not become a second general-purpose API client.
 */
export async function listAdminUsers(): Promise<
  Array<{
    id: string;
    email: string;
    user_roles?: Array<{ role?: { name: string } }>;
  }>
> {
  return apiFetch<
    Array<{
      id: string;
      email: string;
      user_roles?: Array<{ role?: { name: string } }>;
    }>
  >(`/admin/users`, {
    method: 'GET',
    cache: 'no-store',
  });
}

export async function assignUserRole(
  userId: string,
  roleName: string,
) {
  return apiFetch(
    `/admin/users/${userId}/roles`,
    {
      method: 'POST',
      body: JSON.stringify({
        userId,
        roleName,
      }),
    },
  );
}

export async function revokeUserRole(
  userId: string,
  roleName: string,
) {
  return apiFetch(
    `/admin/users/${userId}/roles/${roleName}`,
    {
      method: 'DELETE',
    },
  );
}

export type LeagueSummary = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  region?: string | null;
  _count?: { seasons: number; operators: number };
  seasons?: Array<{ id: string; name: string; status: string; start_date?: string | null; end_date?: string | null }>;
};

export type LeagueDetails = LeagueSummary & {
  operators: Array<{ id: string; user_id: string; region?: string | null; user: { id: string; email: string; username: string } }>;
  seasons: Array<SeasonSummary & { _count?: { divisions: number; participants: number; matches: number } }>;
};

export async function listLeagues(): Promise<LeagueSummary[]> {
  return apiFetch<LeagueSummary[]>('/admin/leagues', { cache: 'no-store' });
}

export async function getLeague(leagueId: string): Promise<LeagueDetails> {
  return apiFetch<LeagueDetails>(`/admin/leagues/${leagueId}`, { cache: 'no-store' });
}

export async function createLeague(payload: { name: string; description?: string; region?: string }): Promise<LeagueSummary> {
  return apiFetch<LeagueSummary>('/admin/leagues', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateLeague(leagueId: string, payload: { name?: string; description?: string | null; region?: string | null; status?: string }): Promise<LeagueSummary> {
  return apiFetch<LeagueSummary>(`/admin/leagues/${leagueId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function archiveLeague(leagueId: string): Promise<LeagueSummary> {
  return apiFetch<LeagueSummary>(`/admin/leagues/${leagueId}`, { method: 'DELETE' });
}

export async function assignLeagueOperator(leagueId: string, userId: string, region?: string): Promise<unknown> {
  return apiFetch<unknown>(`/admin/leagues/${leagueId}/operators`, { method: 'POST', body: JSON.stringify({ userId, region }) });
}

export async function removeLeagueOperator(leagueId: string, userId: string): Promise<unknown> {
  return apiFetch<unknown>(`/admin/leagues/${leagueId}/operators/${userId}`, { method: 'DELETE' });
}

export async function getSeasonOverview(seasonId: string): Promise<SeasonOverview> {
  return apiFetch<SeasonOverview>(`/seasons/${seasonId}/overview`, { cache: 'no-store' });
}

export async function lockSeasonRoster(seasonId: string): Promise<SeasonSummary> {
  return apiFetch<SeasonSummary>(`/seasons/${seasonId}/lock-roster`, { method: 'POST' });
}

export async function generateDivisionFixtures(seasonId: string, divisionId: string): Promise<unknown> {
  return apiFetch<unknown>(`/fixtures/seasons/${seasonId}/divisions/${divisionId}/generate`, { method: 'POST' });
}

export type ScheduleGenerationSummary = {
  fixtureCount: number;
  scheduledCount: number;
  unscheduledCount: number;
  schedulingStatus: string;
  warnings: string[];
};

export async function generateDivisionSchedule(
  seasonId: string,
  divisionId: string,
): Promise<ScheduleGenerationSummary> {
  return apiFetch<ScheduleGenerationSummary>(
    `/fixtures/seasons/${seasonId}/divisions/${divisionId}/schedule/generate`,
    { method: 'POST' },
  );
}

export async function getDivisionFixtures(
  seasonId: string,
  divisionId: string,
  page = 1,
  limit = 25,
): Promise<DivisionFixturePage> {
  return apiFetch<DivisionFixturePage>(
    `/fixtures/seasons/${seasonId}/divisions/${divisionId}?page=${page}&limit=${limit}`,
    { cache: 'no-store' },
  );
}

export async function updateFixtureSchedule(
  seasonId: string,
  divisionId: string,
  fixtureId: string,
  appointment: {
    scheduledAt: string;
    timezone: string;
    checkInOpensAt: string;
    checkInClosesAt: string;
    playWindowOpensAt: string;
    playWindowClosesAt: string;
    reason?: string;
  },
) {
  return apiFetch<unknown>(
    `/fixtures/seasons/${seasonId}/divisions/${divisionId}/fixtures/${fixtureId}/schedule`,
    { method: 'PATCH', body: JSON.stringify(appointment) },
  );
}

export type ScheduleValidationResult = {
  valid: boolean;
  requiresValidation: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    fixtures: number;
    scheduled: number;
    errors: number;
    warnings: number;
    conflicts: number;
  };
};

export async function validateDivisionSchedule(seasonId: string, divisionId: string) {
  return apiFetch<ScheduleValidationResult>(
    `/fixtures/seasons/${seasonId}/divisions/${divisionId}/schedule/validate`,
    { method: 'POST' },
  );
}

export async function lockDivisionSchedule(seasonId: string, divisionId: string) {
  return apiFetch<{ scheduleLocked: boolean }>(
    `/fixtures/seasons/${seasonId}/divisions/${divisionId}/lock`,
    { method: 'POST' },
  );
}

export async function getSeasonFixtureSchedule(seasonId: string): Promise<SeasonFixtureSchedule> {
  return apiFetch<SeasonFixtureSchedule>(`/fixtures/seasons/${seasonId}`, { cache: 'no-store' });
}

export type AdminParticipant = {
  id: string;
  season_id: string;
  division_id: string;
  player_id: string;
  status: string;
  seed?: number | null;
  registered_at: string;
  withdrawn_at?: string | null;
  player: { id: string; gamer_tag: string; user?: { id: string; email: string; username: string } };
  division: { id: string; name: string; type: string; format: string; capacity?: number | null; active: boolean };
};

export async function listAdminParticipants(seasonId: string): Promise<AdminParticipant[]> {
  return apiFetch<AdminParticipant[]>(`/admin/seasons/${seasonId}/participants`, { cache: 'no-store' });
}

export async function adminRegisterParticipant(seasonId: string, payload: { playerId: string; divisionId: string; seed?: number; reason: string }): Promise<AdminParticipant> {
  return apiFetch<AdminParticipant>(`/admin/seasons/${seasonId}/participants`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function bulkAdminRegisterParticipants(seasonId: string, payload: { participants: Array<{ playerId: string; divisionId: string; seed?: number; reason: string }> }): Promise<AdminParticipant[]> {
  return apiFetch<AdminParticipant[]>(`/admin/seasons/${seasonId}/participants/bulk`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateAdminParticipant(seasonId: string, participantId: string, payload: { status?: string; divisionId?: string; seed?: number | null; reason: string }): Promise<AdminParticipant> {
  return apiFetch<AdminParticipant>(`/admin/seasons/${seasonId}/participants/${participantId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function bulkAdminUpdateParticipants(seasonId: string, payload: { participants: Array<{ participantId: string; status?: string; divisionId?: string; seed?: number | null; reason: string }> }): Promise<AdminParticipant[]> {
  return apiFetch<AdminParticipant[]>(`/admin/seasons/${seasonId}/participants/bulk`, { method: 'PATCH', body: JSON.stringify(payload) });
}