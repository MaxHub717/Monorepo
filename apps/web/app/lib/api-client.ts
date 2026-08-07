import type { ApiEnvelope } from '@nexgen/shared';
import { API_VERSION } from '@nexgen/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

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
  club: { id: string; name: string; status: string };
  application: { id: string; status: string };
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

async function apiFetch<T>(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? 'API request failed');
  }

  return res.json() as Promise<ApiEnvelope<T>>;
}

export async function getUserMe(): Promise<UserProfile> {
  const envelope = await apiFetch<UserProfile>(`/${API_VERSION}/users/me`, {
    cache: 'no-store',
  });
  return envelope.data;
}

export async function getLeaderboards(): Promise<LeaderboardsResponse> {
  const envelope = await apiFetch<LeaderboardsResponse>(`/${API_VERSION}/standings/leaderboards`, {
    cache: 'no-store',
  });
  return envelope.data;
}

export async function listMatches(): Promise<MatchSummary[]> {
  const envelope = await apiFetch<MatchSummary[]>(`/${API_VERSION}/matches`, {
    cache: 'no-store',
  });
  return envelope.data;
}

export async function getMyPlayerProfile(): Promise<PlayerProfileResponse> {
  const envelope = await apiFetch<PlayerProfileResponse>(`/${API_VERSION}/players/me/profile`, {
    method: 'GET',
    cache: 'no-store',
  });
  return envelope.data;
}

export async function updateMyPlayerProfile(payload: PlayerProfileUpdateInput): Promise<PlayerProfileUpdateResponse> {
  const envelope = await apiFetch<PlayerProfileUpdateResponse>(`/${API_VERSION}/players/me/profile`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return envelope.data;
}

export async function createClub(dto: CreateClubInput): Promise<ClubCreateResponse> {
  const envelope = await apiFetch<ClubCreateResponse>(`/${API_VERSION}/clubs`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  return envelope.data;
}

export async function applyToClub(clubId: string): Promise<{ id: string; status: string }> {
  const envelope = await apiFetch<{ id: string; status: string }>(`/${API_VERSION}/clubs/${clubId}/applications`, {
    method: 'POST',
  });
  return envelope.data;
}

export async function listClubApplications(clubId: string): Promise<ClubApplicationSummary[]> {
  const envelope = await apiFetch<ClubApplicationSummary[]>(`/${API_VERSION}/clubs/${clubId}/applications`, {
    cache: 'no-store',
  });
  return envelope.data;
}

export async function approveClubApplication(applicationId: string): Promise<unknown> {
  const envelope = await apiFetch<unknown>(`/${API_VERSION}/clubs/applications/${applicationId}/approve`, {
    method: 'POST',
  });
  return envelope.data;
}

export async function rejectClubApplication(applicationId: string): Promise<unknown> {
  const envelope = await apiFetch<unknown>(`/${API_VERSION}/clubs/applications/${applicationId}/reject`, {
    method: 'POST',
  });
  return envelope.data;
}

export async function removeClubMember(clubId: string, memberUserId: string): Promise<unknown> {
  const envelope = await apiFetch<unknown>(`/${API_VERSION}/clubs/${clubId}/members/${memberUserId}`, {
    method: 'DELETE',
  });
  return envelope.data;
}

export async function updateClubMemberStatus(clubId: string, memberUserId: string, status: string): Promise<unknown> {
  const envelope = await apiFetch<unknown>(`/${API_VERSION}/clubs/${clubId}/members/${memberUserId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return envelope.data;
}

export async function listRecruitmentPool(params: { division?: string; region?: string } = {}): Promise<RecruitmentProfile[]> {
  const searchParams = new URLSearchParams();
  if (params.division) searchParams.set('division', params.division);
  if (params.region) searchParams.set('region', params.region);
  const envelope = await apiFetch<RecruitmentProfile[]>(`/${API_VERSION}/players/recruitment-pool?${searchParams.toString()}`, {
    cache: 'no-store',
  });
  return envelope.data;
}

export async function listClubs(): Promise<ClubSummary[]> {
  const envelope = await apiFetch<ClubSummary[]>(`/${API_VERSION}/clubs`, {
    cache: 'no-store',
  });
  return envelope.data;
}

export type SeasonSummary = {
  id: string;
  name: string;
  status: string;
  start_date?: string;
  end_date?: string;
  registration_open_at?: string;
  registration_close_at?: string;
  divisions?: Array<{ id: string; name: string; type: string; capacity: number; active: boolean }>;
};

export async function listSeasons(): Promise<SeasonSummary[]> {
  const envelope = await apiFetch<SeasonSummary[]>(`/${API_VERSION}/seasons`, { cache: 'no-store' });
  return envelope.data;
}

export async function publishSeason(seasonId: string): Promise<SeasonSummary> {
  const envelope = await apiFetch<SeasonSummary>(`/${API_VERSION}/seasons/${seasonId}/publish`, { method: 'POST' });
  return envelope.data;
}

export async function closeSeasonRegistration(seasonId: string): Promise<SeasonSummary> {
  const envelope = await apiFetch<SeasonSummary>(`/${API_VERSION}/seasons/${seasonId}/close-registration`, { method: 'POST' });
  return envelope.data;
}

export async function activateSeason(seasonId: string): Promise<SeasonSummary> {
  const envelope = await apiFetch<SeasonSummary>(`/${API_VERSION}/seasons/${seasonId}/activate`, { method: 'POST' });
  return envelope.data;
}

export async function startSeasonPlayoffs(seasonId: string): Promise<SeasonSummary> {
  const envelope = await apiFetch<SeasonSummary>(`/${API_VERSION}/seasons/${seasonId}/start-playoffs`, { method: 'POST' });
  return envelope.data;
}

export async function completeSeason(seasonId: string): Promise<SeasonSummary> {
  const envelope = await apiFetch<SeasonSummary>(`/${API_VERSION}/seasons/${seasonId}/complete`, { method: 'POST' });
  return envelope.data;
}

export async function archiveSeason(seasonId: string): Promise<SeasonSummary> {
  const envelope = await apiFetch<SeasonSummary>(`/${API_VERSION}/seasons/${seasonId}/archive`, { method: 'POST' });
  return envelope.data;
}

export async function createDivision(seasonId: string, payload: { name: string; type?: string; capacity?: number; active?: boolean }) {
  const envelope = await apiFetch<any>(`/${API_VERSION}/seasons/${seasonId}/divisions`, { method: 'POST', body: JSON.stringify(payload) });
  return envelope.data;
}

export async function updateDivision(divisionId: string, payload: { name?: string; type?: string; capacity?: number; active?: boolean }) {
  const envelope = await apiFetch<any>(`/${API_VERSION}/seasons/divisions/${divisionId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  return envelope.data;
}

export async function deactivateDivision(divisionId: string) {
  const envelope = await apiFetch<any>(`/${API_VERSION}/seasons/divisions/${divisionId}`, { method: 'DELETE' });
  return envelope.data;
}

export async function getSeasonStandings(seasonId: string): Promise<{ seasonId: string; rows: StandingsRow[] }> {
  const envelope = await apiFetch<{ seasonId: string; rows: StandingsRow[] }>(`/${API_VERSION}/standings/seasons/${seasonId}`, {
    cache: 'no-store',
  });
  return envelope.data;
}
