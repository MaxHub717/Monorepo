import { PermissionName, RoleName } from './authz.types.js';

export const ROLE_PERMISSIONS: Record<RoleName, PermissionName[]> = {
  [RoleName.PLAYER]: [],
  [RoleName.CLUB_MANAGER]: [PermissionName.MANAGE_CLUBS, PermissionName.MANAGE_DISPUTES],
  [RoleName.OPERATOR]: [
    PermissionName.MANAGE_MATCHES,
    PermissionName.MANAGE_RESULTS,
    PermissionName.MANAGE_DISPUTES,
    PermissionName.MANAGE_PENALTIES,
  ],
  [RoleName.COMMISSIONER]: [
    PermissionName.MANAGE_SEASONS,
    PermissionName.MANAGE_MATCHES,
    PermissionName.MANAGE_RESULTS,
    PermissionName.MANAGE_DISPUTES,
    PermissionName.MANAGE_PENALTIES,
    PermissionName.MANAGE_CLUBS,
    PermissionName.VIEW_AUDIT,
    PermissionName.VIEW_ADMIN_DASHBOARD,
  ],
  [RoleName.HQ_ADMIN]: [
    PermissionName.MANAGE_USERS,
    PermissionName.MANAGE_ROLES,
    PermissionName.MANAGE_SEASONS,
    PermissionName.MANAGE_MATCHES,
    PermissionName.MANAGE_RESULTS,
    PermissionName.MANAGE_DISPUTES,
    PermissionName.MANAGE_PENALTIES,
    PermissionName.MANAGE_CLUBS,
    PermissionName.VIEW_AUDIT,
    PermissionName.VIEW_ADMIN_DASHBOARD,
  ],
};
