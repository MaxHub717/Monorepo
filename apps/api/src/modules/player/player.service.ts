import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { UpdatePlayerProfileDto } from './dto/player-profile.dto.js';

@Injectable()
export class PlayerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async getPlayer(id: string, requesterId?: string, requesterRoles: string[] = []) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!profile) throw new NotFoundException('Player not found');

    const isOwner = requesterId === profile.user_id;
    const isPrivileged = requesterRoles.includes('HQ_ADMIN') || requesterRoles.includes('COMMISSIONER');

    if (!isOwner && !isPrivileged) {
      const { id: profileId, gamer_tag, region, reputation_score, wins, losses, draws, goals, no_shows, mvp_count, classification, player_status, verification_status, created_at, updated_at } = profile;
      return {
        id: profileId,
        gamer_tag,
        region,
        verification_status,
        player_status,
        reputation_score,
        wins,
        losses,
        draws,
        goals,
        no_shows,
        mvp_count,
        classification,
        created_at,
        updated_at,
      };
    }

    return profile;
  }

  async getCareer(id: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Player not found');
    return {
      id: profile.id,
      matches: profile.wins + profile.losses + profile.draws,
      wins: profile.wins,
      losses: profile.losses,
      draws: profile.draws,
    };
  }

  async getProfileByUserId(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { user_id: userId }, include: { user: true } });
    if (!profile) throw new NotFoundException('Player profile not found');
    return profile;
  }

  async listRecruitmentPool(filters: { division?: string; region?: string }) {
    const where: any = {
      verification_status: 'VERIFIED',
      user: {
        account_status: 'ACTIVE',
        club_members: {
          none: {
            status: 'ACTIVE',
          },
        },
      },
    };

    if (filters.region) {
      where.region = filters.region;
    }
    if (filters.division) {
      where.classification = filters.division as any;
    }

    return this.prisma.playerProfile.findMany({
      where,
      select: {
        id: true,
        gamer_tag: true,
        region: true,
        classification: true,
        player_status: true,
        verification_status: true,
        user: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
      orderBy: { gamer_tag: 'asc' },
    });
  }

  async updateProfile(userId: string, dto: UpdatePlayerProfileDto, actorId: string, actorRole: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { user_id: userId } });
    if (!profile) throw new NotFoundException('Player profile not found');

    const updateData: Record<string, unknown> = {};

    if (dto.gamerTag) {
      const normalized = dto.gamerTag.trim();
      if (!/^[a-zA-Z0-9_-]{3,30}$/.test(normalized)) {
        throw new BadRequestException('gamerTag must be 3-30 characters and contain only letters, numbers, underscore, or dash');
      }
      const existing = await this.prisma.playerProfile.findFirst({ where: { gamer_tag: normalized, user_id: { not: userId } } });
      if (existing) {
        throw new BadRequestException('gamerTag is already in use');
      }
      updateData.gamer_tag = normalized;
    }

    if (dto.region !== undefined) {
      updateData.region = dto.region;
    }

    if (dto.metadata !== undefined) {
      updateData.metadata_json = dto.metadata as any;
    }

    const before = profile;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No profile changes were provided');
    }

    const updated = await this.prisma.playerProfile.update({
      where: { user_id: userId },
      data: updateData,
    });

    await this.auditService.writeLog({
      entityType: 'PlayerProfile',
      entityId: profile.id,
      action: 'PLAYER_PROFILE_UPDATED',
      actorId,
      actorRole,
      beforeState: before,
      afterState: updated,
    });

    await this.outboxService.enqueueEventDirect({
      eventName: 'player.profile_updated',
      aggregateType: 'PlayerProfile',
      aggregateId: profile.id,
      actorId,
      actorRole,
      metadata: { before, after: updated },
    });

    return updated;
  }
}
