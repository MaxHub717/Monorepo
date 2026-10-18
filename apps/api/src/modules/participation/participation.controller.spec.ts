import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY, PUBLIC_KEY } from '../../common/authz/authz.decorators.js';
import { AccountStatusGuard, AuthGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { AdminParticipationController } from './admin-participation.controller.js';
import { MyParticipationController, ParticipationController } from './participation.controller.js';

describe('participation route authorization', () => {
  it('keeps self-registration and My Competitions authenticated and account protected', () => {
    for (const controller of [ParticipationController, MyParticipationController]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual(
        expect.arrayContaining([AuthGuard, AccountStatusGuard]),
      );
      expect(Reflect.getMetadata(PUBLIC_KEY, controller)).toBeUndefined();
    }
    expect(Reflect.getMetadata(PUBLIC_KEY, ParticipationController.prototype.register)).toBeUndefined();
    expect(Reflect.getMetadata(PUBLIC_KEY, MyParticipationController.prototype.list)).toBeUndefined();
  });

  it('keeps the admin participant view behind season-management authorization', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminParticipationController)).toEqual(
      expect.arrayContaining([AuthGuard, AccountStatusGuard, PermissionsGuard]),
    );
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AdminParticipationController)).toContain('MANAGE_SEASONS');
    expect(Reflect.getMetadata(PUBLIC_KEY, AdminParticipationController)).toBeUndefined();
  });
});