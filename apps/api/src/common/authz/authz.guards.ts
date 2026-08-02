import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PermissionName, RoleName } from './authz.types.js';
import { AuthzService } from './authz.service.js';
import { AuthUser } from './authz.types.js';
import {
  OPERATOR_SCOPE_KEY,
  OWNERSHIP_KEY,
  PERMISSIONS_KEY,
  PUBLIC_KEY,
  ROLES_KEY,
} from './authz.decorators.js';

interface AuthRequest extends Request {
  id?: string;
  user?: AuthUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authzService: AuthzService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    const isPublic =
      this.reflector.get<boolean>(PUBLIC_KEY, context.getHandler()) ??
      this.reflector.get<boolean>(PUBLIC_KEY, context.getClass());

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authorization = request.headers.authorization ||
      (request.cookies?.accessToken ? `Bearer ${request.cookies.accessToken}` : undefined);

    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization');
    }

    const token = authorization.replace('Bearer ', '').trim();
    const payload = this.authzService.verifyAccessToken(token);
    const user = await this.authzService.resolveUser(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    request.user = user;
    return true;
  }
}

@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(private readonly authzService: AuthzService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    const isPublic =
      this.reflector.get<boolean>(PUBLIC_KEY, context.getHandler()) ??
      this.reflector.get<boolean>(PUBLIC_KEY, context.getClass());

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (user.accountStatus !== 'ACTIVE') {
      await this.authzService.auditDenied({
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'ACCOUNT_STATUS_DENIED',
        reason: `Account status ${user.accountStatus} is not active`,
        requestId: request.id,
        correlationId: request.url,
      });
      throw new ForbiddenException('Account is not active');
    }

    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authzService: AuthzService) {}

  async canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.get<RoleName[]>(ROLES_KEY, context.getHandler())
      ?? this.reflector.get<RoleName[]>(ROLES_KEY, context.getClass());

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const matches = user.roles.some((role) => requiredRoles.includes(role));
    if (!matches) {
      await this.authzService.auditDenied({
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'ROLE_DENIED',
        reason: `Missing required role: ${requiredRoles.join(', ')}`,
        requestId: request.id,
        correlationId: request.url,
        metadata: { userRoles: user.roles, requiredRoles },
      });
      throw new ForbiddenException('Insufficient role privileges');
    }

    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authzService: AuthzService) {}

  async canActivate(context: ExecutionContext) {
    const requiredPermissions = this.reflector.get<PermissionName[]>(PERMISSIONS_KEY, context.getHandler())
      ?? this.reflector.get<PermissionName[]>(PERMISSIONS_KEY, context.getClass());

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const matches = user.permissions.some((permission) => requiredPermissions.includes(permission));
    if (!matches) {
      await this.authzService.auditDenied({
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'PERMISSION_DENIED',
        reason: `Missing required permission: ${requiredPermissions.join(', ')}`,
        requestId: request.id,
        correlationId: request.url,
        metadata: { userPermissions: user.permissions, requiredPermissions },
      });
      throw new ForbiddenException('Insufficient permission privileges');
    }

    return true;
  }
}

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authzService: AuthzService) {}

  async canActivate(context: ExecutionContext) {
    const ownershipKey = this.reflector.get<string>(OWNERSHIP_KEY, context.getHandler())
      ?? this.reflector.get<string>(OWNERSHIP_KEY, context.getClass());

    if (!ownershipKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const value = request.params?.[ownershipKey] ?? request.body?.[ownershipKey];
    const isOwner = value === user.id;
    const isPrivileged = user.roles.includes(RoleName.HQ_ADMIN) || user.roles.includes(RoleName.COMMISSIONER);

    if (!isOwner && !isPrivileged) {
      await this.authzService.auditDenied({
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'OWNERSHIP_DENIED',
        reason: `Ownership check failed for ${ownershipKey}`,
        requestId: request.id,
        correlationId: request.url,
        metadata: { ownershipKey, value },
      });
      throw new ForbiddenException('Ownership verification failed');
    }

    return true;
  }
}

@Injectable()
export class OperatorScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authzService: AuthzService) {}

  async canActivate(context: ExecutionContext) {
    const scopeKeys = this.reflector.get<string[]>(OPERATOR_SCOPE_KEY, context.getHandler())
      ?? this.reflector.get<string[]>(OPERATOR_SCOPE_KEY, context.getClass());

    if (!scopeKeys?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!user.roles.includes(RoleName.OPERATOR)) {
      return true;
    }

    const operatorProfile = user.operatorProfile;
    if (!operatorProfile) {
      await this.authzService.auditDenied({
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'OPERATOR_SCOPE_DENIED',
        reason: 'Operator profile is missing',
        requestId: request.id,
        correlationId: request.url,
      });
      throw new ForbiddenException('Operator scope cannot be evaluated');
    }

    for (const key of scopeKeys) {
      const value = request.body?.[key] ?? request.params?.[key];
      if (!value) {
        continue;
      }

      if (key.toLowerCase().includes('division') && value !== operatorProfile.assigned_division_id) {
        await this.authzService.auditDenied({
          actorId: user.id,
          actorRole: user.roles[0],
          action: 'OPERATOR_SCOPE_DENIED',
          reason: 'Division scope mismatch',
          requestId: request.id,
          correlationId: request.url,
          metadata: { requiredDivision: operatorProfile.assigned_division_id, value },
        });
        throw new ForbiddenException('Operator may not act outside assigned division');
      }

      if (key.toLowerCase().includes('region') && value !== operatorProfile.region) {
        await this.authzService.auditDenied({
          actorId: user.id,
          actorRole: user.roles[0],
          action: 'OPERATOR_SCOPE_DENIED',
          reason: 'Region scope mismatch',
          requestId: request.id,
          correlationId: request.url,
          metadata: { requiredRegion: operatorProfile.region, value },
        });
        throw new ForbiddenException('Operator may not act outside assigned region');
      }
    }

    return true;
  }
}
