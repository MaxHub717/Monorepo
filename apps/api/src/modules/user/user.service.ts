import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { player_profile: true, user_roles: { include: { role: true } } } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { player_profile: true, user_roles: { include: { role: true } } } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async assignRole(userId: string, roleName: string) {
    const role = await this.prisma.role.findUnique({ where: { name: roleName as any } });
    if (!role) throw new NotFoundException('Role not found');
    return this.prisma.userRole.create({ data: { user_id: userId, role_id: role.id } });
  }

  async revokeRole(userId: string, roleName: string) {
    const role = await this.prisma.role.findUnique({ where: { name: roleName as any } });
    if (!role) throw new NotFoundException('Role not found');
    const existing = await this.prisma.userRole.findFirst({ where: { user_id: userId, role_id: role.id } });
    if (!existing) throw new NotFoundException('User does not have the role');
    await this.prisma.userRole.delete({ where: { id: existing.id } });
    return { deleted: true };
  }

  async listUsersWithRoles() {
    return this.prisma.user.findMany({ include: { user_roles: { include: { role: true } }, player_profile: true } });
  }

  async upsertOperatorProfile(userId: string, data: { assignedDivisionId?: string | null; region?: string | null }) {
    // create or update operator_profile for the user
    return this.prisma.operatorProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId, assigned_division_id: data.assignedDivisionId ?? null, region: data.region ?? null },
      update: { assigned_division_id: data.assignedDivisionId ?? null, region: data.region ?? null },
    });
  }

  async getOperatorProfile(userId: string) {
    const profile = await this.prisma.operatorProfile.findUnique({ where: { user_id: userId } });
    if (!profile) throw new NotFoundException('Operator profile not found');
    return profile;
  }

  async deleteOperatorProfile(userId: string) {
    const existing = await this.prisma.operatorProfile.findUnique({ where: { user_id: userId } });
    if (!existing) throw new NotFoundException('Operator profile not found');
    await this.prisma.operatorProfile.delete({ where: { id: existing.id } });
    return { deleted: true };
  }
}
