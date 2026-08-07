export type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export enum RoleName {
  PLAYER = 'PLAYER',
  CLUB_MANAGER = 'CLUB_MANAGER',
  OPERATOR = 'OPERATOR',
  COMMISSIONER = 'COMMISSIONER',
  HQ_ADMIN = 'HQ_ADMIN',
}

export enum PermissionName {
  MANAGE_USERS = 'MANAGE_USERS',
  MANAGE_ROLES = 'MANAGE_ROLES',
  MANAGE_SEASONS = 'MANAGE_SEASONS',
  MANAGE_MATCHES = 'MANAGE_MATCHES',
  MANAGE_RESULTS = 'MANAGE_RESULTS',
  MANAGE_DISPUTES = 'MANAGE_DISPUTES',
  MANAGE_PENALTIES = 'MANAGE_PENALTIES',
  MANAGE_CLUBS = 'MANAGE_CLUBS',
  VIEW_AUDIT = 'VIEW_AUDIT',
  VIEW_ADMIN_DASHBOARD = 'VIEW_ADMIN_DASHBOARD',
}

export interface OperatorProfile {
  assigned_division_id?: string | null;
  region?: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  accountStatus: AccountStatus;
  roles: RoleName[];
  permissions: PermissionName[];
  operatorProfile?: OperatorProfile | null;
}

export interface JwtAuthPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
}
