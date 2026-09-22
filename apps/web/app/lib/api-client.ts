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
    payload.success !== true
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

export type SeasonOverview = SeasonSummary & {
  counts: { participants: number; divisions: number; fixtures: number; matches: number; pendingResults: number; disputes: number; penalties: number };
  divisions: Array<{ id: string; name: string; type: string; format: string; capacity: number | null; active: boolean; _count: { participants: number; fixtures: number; matches: number; standings_rows: number } }>;
  nextAction: { label: string; endpoint: string; reason: string } | null;
};

export async function createSeason(payload: { leagueId: string; name: string; description?: string; startDate: string; endDate: string; divisionName?: string; divisionType?: string; divisionFormat?: string; divisionCapacity?: number }): Promise<SeasonSummary> {
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
    capacity?: number;
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
    capacity?: number;
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