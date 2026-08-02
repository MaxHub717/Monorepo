import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, IsEnum } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { Prisma, $Enums } from '@prisma/client';

export class CreatePenaltyDto {
  @IsOptional()
  @IsUUID('4')
  matchId?: string;

  @IsOptional()
  @IsUUID('4')
  clubId?: string;

  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsOptional()
  @IsUUID('4')
  disputeId?: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdatePenaltyStatusDto {
  @IsUUID('4')
  penaltyId!: string;

  @IsString()
  status!: string;
}

@Injectable()
export class PenaltyService {
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxService) {}

  async listPenalties() {
    return this.prisma.penalty.findMany({ include: { match: true, club: true, user: true, dispute: true } });
  }

  async createPenalty(dto: CreatePenaltyDto, actor?: { id?: string; role?: string; requestId?: string }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const penalty = await tx.penalty.create({
        data: {
          match_id: dto.matchId ?? null,
          club_id: dto.clubId ?? null,
          user_id: dto.userId ?? null,
          dispute_id: dto.disputeId ?? null,
          type: dto.type as $Enums.PenaltyType,
          status: 'PROPOSED',
          reason: dto.reason ?? null,
        },
      });

      await this.outbox.enqueueEvent(tx, {
        eventName: 'penalty.proposed',
        aggregateType: 'Penalty',
        aggregateId: penalty.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.requestId,
        metadata: { penalty },
      });

      return penalty;
    });
  }

  async updatePenaltyStatus(dto: UpdatePenaltyStatusDto, actor?: { id?: string; role?: string; requestId?: string }) {
    const existing = await this.prisma.penalty.findUnique({ where: { id: dto.penaltyId } });
    if (!existing) throw new NotFoundException('Penalty not found');
    const allowed: Partial<Record<$Enums.PenaltyStatus, $Enums.PenaltyStatus[]>> = {
      PROPOSED: ['UNDER_REVIEW', 'APPROVED', 'REVOKED'],
      UNDER_REVIEW: ['APPROVED', 'REVOKED'],
      APPROVED: ['ACTIVE', 'EXPIRED', 'REVOKED'],
      ACTIVE: ['EXPIRED', 'REVOKED'],
    };

    const from = existing.status as $Enums.PenaltyStatus;
    const to = dto.status as $Enums.PenaltyStatus;
    if (from !== to && allowed[from]?.includes(to) === false) {
      throw new BadRequestException(`Invalid penalty transition from ${from} to ${to}`);
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.penalty.update({ where: { id: dto.penaltyId }, data: { status: to } });

      await this.outbox.enqueueEvent(tx, {
        eventName: `penalty.${dto.status.toLowerCase()}`,
        aggregateType: 'Penalty',
        aggregateId: updated.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.requestId,
        metadata: { penalty: updated },
      });

      return updated;
    });
  }
}
