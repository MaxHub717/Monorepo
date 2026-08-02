import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { AuditService } from '../../modules/audit/audit.service.js';
import { PrismaService } from '../../modules/prisma/prisma.service.js';
import { AuthUser, JwtAuthPayload, PermissionName, RoleName } from './authz.types.js';

@Injectable()
export class AuthzService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {}

  verifyAccessToken(token: string): JwtAuthPayload {
    try {
      const secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
      const decoded = jwt.verify(token, secret);

      if (typeof decoded !== 'object' || decoded === null) {
        throw new UnauthorizedException('Invalid access token');
      }

      const payload = decoded as JwtAuthPayload;
      if (!payload.sub || !payload.email || payload.type !== 'access') {
        throw new UnauthorizedException('Invalid access token payload');
      }

      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  async resolveUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        user_roles: {
          include: {
            role: {
              include: {
                role_permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        operator_profile: true,
      },
    });

    if (!user) {
      return null;
    }

    const roles = (user.user_roles as any[]).map((userRole: any) => userRole.role.name as RoleName);
    const permissions = (user.user_roles as any[]).flatMap((userRole: any) =>
      (userRole.role.role_permissions as any[]).map((rolePermission: any) => rolePermission.permission.name as PermissionName),
    );

    return {
      id: user.id,
      email: user.email,
      accountStatus: user.account_status,
      roles,
      permissions,
      operatorProfile: user.operator_profile,
    };
  }

  async auditDenied(input: {
    actorId?: string;
    actorRole?: string;
    action: string;
    reason: string;
    requestId?: string;
    correlationId?: string;
    metadata?: unknown;
  }) {
    await this.auditService.writeLog({
      entityType: 'Authorization',
      entityId: input.actorId ?? 'unknown',
      action: input.action,
      actorId: input.actorId,
      actorRole: input.actorRole,
      reason: input.reason,
      requestId: input.requestId,
      correlationId: input.correlationId,
      metadata: input.metadata,
    });
  }
}
