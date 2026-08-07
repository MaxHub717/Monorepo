export type SortOrder = 'asc' | 'desc';

export interface ApiError {
  code: string;
  message: string;
}

export type EventCategory = 'COMMAND' | 'EVENT' | 'SYSTEM' | 'AUDIT' | 'NOTIFICATION';

export interface DomainEventEnvelope {
  event_id: string;
  event_name: string;
  event_category: EventCategory;
  occurred_at: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  season_id?: string;
  club_id?: string;
  match_id?: string;
  dispute_id?: string;
  penalty_id?: string;
  application_id?: string;
  actor_id?: string;
  actor_role?: string;
  actor_type?: string;
  request_id?: string;
  correlation_id?: string;
  causation_id?: string;
  source?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export type PermissionName =
  | 'MANAGE_USERS'
  | 'MANAGE_ROLES'
  | 'MANAGE_SEASONS'
  | 'MANAGE_MATCHES'
  | 'MANAGE_RESULTS'
  | 'MANAGE_DISPUTES'
  | 'MANAGE_PENALTIES'
  | 'MANAGE_CLUBS'
  | 'VIEW_AUDIT'
  | 'VIEW_ADMIN_DASHBOARD';

export type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export type MatchStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'CHECK_IN_OPEN'
  | 'CHECK_IN_CLOSED'
  | 'IN_PROGRESS'
  | 'SUBMISSION_PENDING'
  | 'UNDER_REVIEW'
  | 'CONFIRMED'
  | 'DISPUTED'
  | 'FORFEITED'
  | 'VOID'
  | 'ARCHIVED';

export type SeasonStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'ROSTER_LOCKED'
  | 'ACTIVE'
  | 'PLAYOFFS'
  | 'COMPLETED'
  | 'ARCHIVED';

export type ClubStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'ARCHIVED';

export type DisputeStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'ESCALATED' | 'RESOLVED' | 'REJECTED' | 'CLOSED';

export type PenaltyStatus = 'PROPOSED' | 'UNDER_REVIEW' | 'APPROVED' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export type PlayerStatus =
  | 'REGISTERED'
  | 'VERIFIED'
  | 'FREE_AGENT'
  | 'CLUB_MEMBER'
  | 'SUSPENDED'
  | 'BANNED'
  | 'RETIRED'
  | 'ARCHIVED';

export type PenaltyType =
  'WARNING' | 'FORFEIT' | 'POINT_DEDUCTION' | 'SUSPENSION' | 'BAN';

export type RoleName = 'PLAYER' | 'CLUB_MANAGER' | 'OPERATOR' | 'COMMISSIONER' | 'HQ_ADMIN';

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error: ApiError | null;
};

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: SortOrder;
}

export interface PaginatedEnvelope<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function createPaginatedEnvelope<T>(
  items: T[],
  page: number,
  limit: number,
  total: number,
): PaginatedEnvelope<T> {
  return {
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / Math.max(limit, 1))),
    },
  };
}
