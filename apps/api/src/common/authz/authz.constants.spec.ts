import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from './authz.constants.js';
import { PermissionName, RoleName } from './authz.types.js';

describe('competition override permission assignments', () => {
  it('grants competition result overrides only to Commissioners and HQ Administrators by default', () => {
    expect(ROLE_PERMISSIONS[RoleName.OPERATOR]).not.toContain(PermissionName.OVERRIDE_COMPETITION_RESULTS);
    expect(ROLE_PERMISSIONS[RoleName.OPERATOR]).not.toContain(PermissionName.MANAGE_COMPETITION_EXCEPTIONS);
    expect(ROLE_PERMISSIONS[RoleName.COMMISSIONER]).toContain(PermissionName.OVERRIDE_COMPETITION_RESULTS);
    expect(ROLE_PERMISSIONS[RoleName.COMMISSIONER]).toContain(PermissionName.MANAGE_COMPETITION_EXCEPTIONS);
    expect(ROLE_PERMISSIONS[RoleName.HQ_ADMIN]).toContain(PermissionName.OVERRIDE_COMPETITION_RESULTS);
    expect(ROLE_PERMISSIONS[RoleName.HQ_ADMIN]).toContain(PermissionName.MANAGE_COMPETITION_EXCEPTIONS);
    expect(ROLE_PERMISSIONS[RoleName.PLAYER]).not.toContain(PermissionName.OVERRIDE_COMPETITION_RESULTS);
    expect(ROLE_PERMISSIONS[RoleName.CLUB_MANAGER]).not.toContain(PermissionName.OVERRIDE_COMPETITION_RESULTS);
  });
});
