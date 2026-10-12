import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AuthGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { PERMISSIONS_KEY } from '../../common/authz/authz.decorators.js';
import { PermissionName } from '../../common/authz/authz.types.js';
import { SeasonRulesController } from './competition-ruleset.controller.js';

function context(request: any) {
  return {
    getHandler: () => function handler() {},
    getClass: () => SeasonRulesController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

describe('season rules route authorization', () => {
  it('rejects a request without an access token', async () => {
    const authz = { verifyAccessToken: vi.fn(), resolveUser: vi.fn() };
    const guard = new AuthGuard(authz as any, { get: () => undefined } as any);
    const request = { headers: {}, cookies: {} };

    await expect(guard.canActivate(context(request))).rejects.toThrow('Missing or invalid authorization');
    expect(authz.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('accepts the login access cookie and requires MANAGE_SEASONS', async () => {
    const authz = {
      verifyAccessToken: vi.fn().mockReturnValue({ sub: 'manager-id' }),
      resolveUser: vi.fn().mockResolvedValue({ id: 'manager-id', roles: ['COMMISSIONER'], permissions: [PermissionName.MANAGE_SEASONS] }),
    };
    const authGuard = new AuthGuard(authz as any, { get: () => undefined } as any);
    const request: any = { headers: {}, cookies: { accessToken: 'valid-token' } };
    expect(await authGuard.canActivate(context(request))).toBe(true);

    const reflector = { get: vi.fn().mockReturnValue([PermissionName.MANAGE_SEASONS]) };
    const permissionGuard = new PermissionsGuard(reflector as any, { auditDenied: vi.fn() } as any);
    expect(await permissionGuard.canActivate(context(request))).toBe(true);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, SeasonRulesController)).toEqual([PermissionName.MANAGE_SEASONS]);
  });

  it('forbids authenticated users without season-management permission', async () => {
    const reflector = { get: vi.fn().mockReturnValue([PermissionName.MANAGE_SEASONS]) };
    const guard = new PermissionsGuard(reflector as any, { auditDenied: vi.fn() } as any);

    await expect(guard.canActivate(context({ user: { id: 'player-id', roles: ['PLAYER'], permissions: [] } })))
      .rejects.toThrow('Insufficient permission privileges');
  });
});
