import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { PermissionName, RoleName } from './authz.types.js';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';
export const OWNERSHIP_KEY = 'ownership';
export const OPERATOR_SCOPE_KEY = 'operatorScope';
export const PUBLIC_KEY = 'isPublic';

export const RequireRole = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
export const RequirePermission = (...permissions: PermissionName[]) => SetMetadata(PERMISSIONS_KEY, permissions);
export const RequireOwnership = (property: string) => SetMetadata(OWNERSHIP_KEY, property);
export const RequireOperatorScope = (...properties: string[]) => SetMetadata(OPERATOR_SCOPE_KEY, properties);
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  if (!request || !request.user) return null;
  return data ? request.user[data] : request.user;
});
