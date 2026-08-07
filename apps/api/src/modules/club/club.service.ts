import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ClubStatus } from '@nexgen/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { CreateClubDto, UpdateClubDto, AssignClubStaffDto } from './dto/club.dto.js';
import { RoleName } from '../../common/authz/authz.types.js';

export type ClubMemberRole = 'MANAGER' | 'COACH' | 'PLAYER' | 'SUPPORT';
export type ClubMembershipStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE' | 'SUSPENDED';

@Injectable()
export class ClubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async listClubs() {
    return this.prisma.club.findMany({
      include: {
        members: true,
      },
    });
  }

  async createClub(dto: CreateClubDto & { ownerId: string }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.club.findFirst({ where: { OR: [{ name: dto.name }, { tag: dto.tag }] } });
      if (existing) {
        throw new BadRequestException('Club name or tag already exists');
      }

      const club = await tx.club.create({
        data: {
          name: dto.name,
          tag: dto.tag,
          region: dto.region,
          description: dto.description ?? null,
          status: 'PENDING_APPROVAL',
        },
      });

      const application = await tx.clubApplication.create({
        data: {
          club_id: club.id,
          user_id: dto.ownerId,
          status: 'PENDING',
          note: 'Club created and awaiting approval.',
        },
      });

      await tx.clubMember.create({
        data: {
          club_id: club.id,
          user_id: dto.ownerId,
          role: 'MANAGER',
          status: 'ACTIVE',
        },
      });

      await tx.playerProfile.updateMany({
        where: { user_id: dto.ownerId },
        data: { player_status: 'CLUB_MEMBER' },
      });

      await this.outboxService.enqueueEvent(tx, {
        eventName: 'club.created',
        aggregateType: 'Club',
        aggregateId: club.id,
        metadata: { club, application },
      });

      await this.auditService.writeLog({
        entityType: 'Club',
        entityId: club.id,
        action: 'CLUB_CREATED',
        actorId: dto.ownerId,
        actorRole: 'MANAGER',
        afterState: { club, application },
      });

      return { club, application };
    });
  }

  async applyToClub(clubId: string, userId: string, note?: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club not found');
    if (club.status !== 'ACTIVE') {
      throw new BadRequestException('Club is not accepting membership applications');
    }

    const profile = await this.prisma.playerProfile.findUnique({ where: { user_id: userId }, include: { user: true } });
    if (!profile) {
      throw new BadRequestException('Player profile required to apply to a club');
    }
    if (profile.verification_status !== 'VERIFIED') {
      throw new BadRequestException('Only verified players may apply to clubs');
    }
    if (profile.user.account_status !== 'ACTIVE') {
      throw new BadRequestException('Only active players may apply to clubs');
    }

    const existingMembership = await this.prisma.clubMember.findFirst({ where: { user_id: userId, status: 'ACTIVE' } });
    if (existingMembership) {
      throw new BadRequestException('Player already belongs to a club');
    }

    const duplicate = await this.prisma.clubApplication.findFirst({ where: { club_id: clubId, user_id: userId, status: 'PENDING' } });
    if (duplicate) {
      throw new BadRequestException('A pending application already exists for this club');
    }

    const application = await this.prisma.clubApplication.create({
      data: {
        club_id: clubId,
        user_id: userId,
        status: 'PENDING',
        note: note ?? null,
      },
    });

    await this.auditService.writeLog({
      entityType: 'ClubApplication',
      entityId: application.id,
      action: 'CLUB_APPLICATION_SUBMITTED',
      actorId: userId,
      actorRole: 'PLAYER',
      afterState: application,
    });

    await this.outboxService.enqueueEventDirect({
      eventName: 'club.application.submitted',
      aggregateType: 'ClubApplication',
      aggregateId: application.id,
      actorId: userId,
      actorRole: 'PLAYER',
      metadata: application,
    });

    return application;
  }

  async listClubApplications(clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club not found');

    return this.prisma.clubApplication.findMany({
      where: { club_id: clubId },
      include: {
        user: { select: { id: true, email: true, username: true } },
        club: { select: { id: true, name: true } },
      },
      orderBy: { submitted_at: 'desc' },
    });
  }

  async approveClubApplication(applicationId: string, actorId: string, actorRole: string) {
    const application = await this.prisma.clubApplication.findUnique({
      where: { id: applicationId },
      include: { club: true },
    });
    if (!application) throw new NotFoundException('Club application not found');
    if (application.status !== 'PENDING') {
      throw new BadRequestException('Only pending applications can be approved');
    }

    const clubId = application.club_id ?? application.club?.id;
    if (!clubId) {
      throw new BadRequestException('Application does not reference a club');
    }

    if (actorRole !== RoleName.COMMISSIONER && actorRole !== RoleName.HQ_ADMIN) {
      const manager = await this.prisma.clubMember.findFirst({
        where: {
          club_id: clubId,
          user_id: actorId,
          role: 'MANAGER',
          status: 'ACTIVE',
        },
      });
      if (!manager) {
        throw new ForbiddenException('Only club managers of this club can approve applications');
      }
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedApplication = await tx.clubApplication.update({
        where: { id: applicationId },
        data: { status: 'APPROVED', reviewed_at: new Date() },
      });

      const club = await tx.club.update({
        where: { id: clubId },
        data: {
          status: application.club?.status === 'PENDING_APPROVAL' ? 'ACTIVE' : application.club?.status,
        },
      });

      if (application.user_id) {
        const memberRole: ClubMemberRole = application.club?.status === 'PENDING_APPROVAL' ? 'MANAGER' : 'PLAYER';
        await tx.clubMember.upsert({
          where: {
            club_id_user_id: {
              club_id: clubId,
              user_id: application.user_id,
            },
          },
          create: {
            club_id: clubId,
            user_id: application.user_id,
            role: memberRole,
            status: 'ACTIVE',
          },
          update: {
            role: memberRole,
            status: 'ACTIVE',
            left_at: null,
          },
        });

        await tx.playerProfile.updateMany({
          where: { user_id: application.user_id },
          data: { player_status: 'CLUB_MEMBER' },
        });
      }

      await this.outboxService.enqueueEvent(tx, {
        eventName: 'club.application.approved',
        aggregateType: 'ClubApplication',
        aggregateId: updatedApplication.id,
        metadata: { application: updatedApplication, club },
      });

      await this.auditService.writeLog({
        entityType: 'ClubApplication',
        entityId: updatedApplication.id,
        action: 'CLUB_APPLICATION_APPROVED',
        actorId,
        actorRole,
        beforeState: application,
        afterState: updatedApplication,
      });

      return { application: updatedApplication, club };
    });
  }

  async rejectClubApplication(applicationId: string, actorId: string, actorRole: string) {
    const application = await this.prisma.clubApplication.findUnique({
      where: { id: applicationId },
      include: { club: true },
    });
    if (!application) throw new NotFoundException('Club application not found');
    if (application.status !== 'PENDING') {
      throw new BadRequestException('Only pending applications can be rejected');
    }

    const clubId = application.club_id ?? application.club?.id;
    if (!clubId) {
      throw new BadRequestException('Application does not reference a club');
    }

    if (actorRole !== RoleName.COMMISSIONER && actorRole !== RoleName.HQ_ADMIN) {
      const manager = await this.prisma.clubMember.findFirst({
        where: {
          club_id: clubId,
          user_id: actorId,
          role: 'MANAGER',
          status: 'ACTIVE',
        },
      });
      if (!manager) {
        throw new ForbiddenException('Only club managers of this club can reject applications');
      }
    }

    const updatedApplication = await this.prisma.clubApplication.update({
      where: { id: applicationId },
      data: { status: 'REJECTED', reviewed_at: new Date() },
    });

    await this.outboxService.enqueueEventDirect({
      eventName: 'club.application.rejected',
      aggregateType: 'ClubApplication',
      aggregateId: updatedApplication.id,
      actorId,
      actorRole,
      metadata: updatedApplication,
    });

    await this.auditService.writeLog({
      entityType: 'ClubApplication',
      entityId: updatedApplication.id,
      action: 'CLUB_APPLICATION_REJECTED',
      actorId,
      actorRole,
      beforeState: application,
      afterState: updatedApplication,
    });

    return updatedApplication;
  }

  async removeClubMember(clubId: string, memberUserId: string, actorId: string, actorRole: string) {
    await this.assertClubManager(clubId, actorId, actorRole);

    const membership = await this.prisma.clubMember.findUnique({
      where: { club_id_user_id: { club_id: clubId, user_id: memberUserId } },
    });
    if (!membership) {
      throw new NotFoundException('Club member not found');
    }
    if (membership.status !== 'ACTIVE') {
      throw new BadRequestException('Only active members can be removed');
    }

    const updated = await this.prisma.clubMember.update({
      where: { club_id_user_id: { club_id: clubId, user_id: memberUserId } },
      data: { status: 'INACTIVE', left_at: new Date() },
    });

    const activeCount = await this.prisma.clubMember.count({ where: { user_id: memberUserId, status: 'ACTIVE' } });
    if (activeCount === 0) {
      await this.prisma.playerProfile.updateMany({
        where: { user_id: memberUserId },
        data: { player_status: 'FREE_AGENT' },
      });
    }

    await this.auditService.writeLog({
      entityType: 'ClubMember',
      entityId: updated.id,
      action: 'CLUB_MEMBER_REMOVED',
      actorId,
      actorRole,
      beforeState: membership,
      afterState: updated,
    });

    await this.outboxService.enqueueEventDirect({
      eventName: 'club.member_removed',
      aggregateType: 'ClubMember',
      aggregateId: updated.id,
      actorId,
      actorRole,
      metadata: updated,
    });

    return updated;
  }

  async updateClubMemberStatus(clubId: string, memberUserId: string, status: ClubMembershipStatus, actorId: string, actorRole: string) {
    await this.assertClubManager(clubId, actorId, actorRole);

    const membership = await this.prisma.clubMember.findUnique({
      where: { club_id_user_id: { club_id: clubId, user_id: memberUserId } },
    });
    if (!membership) {
      throw new NotFoundException('Club member not found');
    }

    const allowedStatuses: ClubMembershipStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(`Invalid membership status: ${status}`);
    }

    const updateData: Record<string, unknown> = { status };
    if (status === 'ACTIVE') {
      updateData.left_at = null;
    }
    if (status === 'INACTIVE') {
      updateData.left_at = new Date();
    }

    const updated = await this.prisma.clubMember.update({
      where: { club_id_user_id: { club_id: clubId, user_id: memberUserId } },
      data: updateData,
    });

    const activeCount = await this.prisma.clubMember.count({ where: { user_id: memberUserId, status: 'ACTIVE' } });
    if (status === 'ACTIVE') {
      await this.prisma.playerProfile.updateMany({
        where: { user_id: memberUserId },
        data: { player_status: 'CLUB_MEMBER' },
      });
    } else if (activeCount === 0) {
      await this.prisma.playerProfile.updateMany({
        where: { user_id: memberUserId },
        data: { player_status: 'FREE_AGENT' },
      });
    }

    await this.auditService.writeLog({
      entityType: 'ClubMember',
      entityId: updated.id,
      action: 'CLUB_MEMBER_STATUS_UPDATED',
      actorId,
      actorRole,
      beforeState: membership,
      afterState: updated,
    });

    await this.outboxService.enqueueEventDirect({
      eventName: 'club.member_status_updated',
      aggregateType: 'ClubMember',
      aggregateId: updated.id,
      actorId,
      actorRole,
      metadata: updated,
    });

    return updated;
  }

  async updateClub(clubId: string, userId: string, dto: UpdateClubDto) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, include: { members: true } });
    if (!club) throw new NotFoundException('Club not found');

    const manager = club.members.find((member: any) => member.user_id === userId && member.role === 'MANAGER' && member.status === 'ACTIVE');
    if (!manager) {
      throw new ForbiddenException('Only club managers can update the club');
    }

    const duplicateWhere: any = {
      id: { not: clubId },
      OR: [],
    };
    if (dto.name) duplicateWhere.OR?.push({ name: dto.name });
    if (dto.tag) duplicateWhere.OR?.push({ tag: dto.tag });

    if (duplicateWhere.OR?.length) {
      const duplicate = await this.prisma.club.findFirst({ where: duplicateWhere });
      if (duplicate) {
        throw new BadRequestException('Club name or tag already exists');
      }
    }

    const before = club;
    const updated = await this.prisma.club.update({
      where: { id: clubId },
      data: {
        name: dto.name ?? club.name,
        tag: dto.tag ?? club.tag,
        region: dto.region ?? club.region,
        description: dto.description ?? club.description,
      },
    });

    await this.auditService.writeLog({
      entityType: 'Club',
      entityId: club.id,
      action: 'CLUB_UPDATED',
      actorId: userId,
      actorRole: 'MANAGER',
      beforeState: before,
      afterState: updated,
    });

    await this.outboxService.enqueueEventDirect({
      eventName: 'club.updated',
      aggregateType: 'Club',
      aggregateId: club.id,
      actorId: userId,
      actorRole: 'MANAGER',
      metadata: { before, after: updated },
    });

    return updated;
  }

  async assignClubStaff(clubId: string, userId: string, dto: AssignClubStaffDto, actorRole: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, include: { members: true } });
    if (!club) throw new NotFoundException('Club not found');

    const manager = club.members.find((member: any) => member.user_id === userId && member.role === 'MANAGER' && member.status === 'ACTIVE');
    if (!manager) {
      throw new ForbiddenException('Only club managers can assign staff');
    }

    const assignment = await this.prisma.clubMember.upsert({
      where: { club_id_user_id: { club_id: clubId, user_id: dto.userId } },
      create: {
        club_id: clubId,
        user_id: dto.userId,
        role: dto.role,
        status: 'ACTIVE',
      },
      update: {
        role: dto.role,
        status: 'ACTIVE',
      },
    });

    await this.auditService.writeLog({
      entityType: 'ClubMember',
      entityId: assignment.id,
      action: 'CLUB_STAFF_ASSIGNED',
      actorId: userId,
      actorRole,
      afterState: assignment,
    });

    await this.outboxService.enqueueEventDirect({
      eventName: 'club.staff_assigned',
      aggregateType: 'ClubMember',
      aggregateId: assignment.id,
      actorId: userId,
      actorRole,
      metadata: assignment,
    });

    return assignment;
  }

  async updateClubStatus(clubId: string, status: string, actorId: string, actorRole: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club not found');

    const allowed: Record<ClubStatus, ClubStatus[]> = {
      PENDING_APPROVAL: ['ACTIVE', 'REJECTED'],
      ACTIVE: ['SUSPENDED', 'ARCHIVED'],
      SUSPENDED: ['ACTIVE', 'ARCHIVED'],
      REJECTED: ['ARCHIVED'],
      ARCHIVED: [],
    };
    const nextStatus = status as ClubStatus;
    if (!allowed[club.status as ClubStatus]?.includes(nextStatus)) {
      throw new BadRequestException(`Invalid club status transition from ${club.status} to ${status}`);
    }

    const before = club;
    const updated = await this.prisma.club.update({ where: { id: clubId }, data: { status: nextStatus } });

    await this.auditService.writeLog({
      entityType: 'Club',
      entityId: club.id,
      action: `CLUB_${status}`,
      actorId,
      actorRole,
      beforeState: before,
      afterState: updated,
    });

    await this.outboxService.enqueueEventDirect({
      eventName: `club.${status.toLowerCase()}`,
      aggregateType: 'Club',
      aggregateId: club.id,
      actorId,
      actorRole,
      metadata: { before, after: updated },
    });

    return updated;
  }

  private async assertClubManager(clubId: string, userId: string, actorRole: string) {
    if (actorRole === RoleName.COMMISSIONER || actorRole === RoleName.HQ_ADMIN) {
      return;
    }

    const membership = await this.prisma.clubMember.findFirst({
      where: {
        club_id: clubId,
        user_id: userId,
        role: 'MANAGER',
        status: 'ACTIVE',
      },
    });

    if (!membership) {
      throw new ForbiddenException('Only club managers of this club can perform this action');
    }
  }
}
