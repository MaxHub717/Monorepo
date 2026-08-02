import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { Prisma, $Enums } from '@prisma/client';

export class CreateDisputeDto {
  @IsUUID('4')
  matchId!: string;

  @IsOptional()
  @IsUUID('4')
  clubId?: string;

  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsString()
  @IsNotEmpty()
  issue!: string;
}

export class UpdateDisputeStatusDto {
  @IsUUID('4')
  disputeId!: string;

  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  resolution?: string;
}

@Injectable()
export class DisputeService {
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxService) {}

  async listDisputes() {
    return this.prisma.dispute.findMany({ include: { match: true, club: true, user: true } });
  }

  async createDispute(dto: CreateDisputeDto, actor?: { id?: string; role?: string; requestId?: string }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const dispute = await tx.dispute.create({
        data: {
          match_id: dto.matchId,
          club_id: dto.clubId ?? null,
          user_id: dto.userId ?? null,
          issue: dto.issue,
          status: 'SUBMITTED',
        },
      });

      await this.outbox.enqueueEvent(tx, {
        eventName: 'dispute.submitted',
        aggregateType: 'Dispute',
        aggregateId: dispute.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.requestId,
        metadata: { dispute },
      });

      return dispute;
    });
  }

  async updateDisputeStatus(dto: UpdateDisputeStatusDto, actor?: { id?: string; role?: string; requestId?: string }) {
    const existing = await this.prisma.dispute.findUnique({ where: { id: dto.disputeId } });
    if (!existing) throw new NotFoundException('Dispute not found');

    // Basic lifecycle enforcement: can only move from SUBMITTED -> UNDER_REVIEW -> RESOLVED/REJECTED -> CLOSED
    const allowedTransitions: Partial<Record<$Enums.DisputeStatus, $Enums.DisputeStatus[]>> = {
      SUBMITTED: ['UNDER_REVIEW'],
      UNDER_REVIEW: ['ESCALATED', 'RESOLVED', 'REJECTED'],
      RESOLVED: ['CLOSED'],
      REJECTED: ['CLOSED'],
      ESCALATED: ['UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
    };

    const from = existing.status as $Enums.DisputeStatus;
    const to = dto.status as $Enums.DisputeStatus;
    if (from !== to && allowedTransitions[from]?.includes(to) === false) {
      throw new BadRequestException(`Invalid dispute transition from ${from} to ${to}`);
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.dispute.update({ where: { id: dto.disputeId }, data: { status: to, resolution: dto.resolution } });

      await this.outbox.enqueueEvent(tx, {
        eventName: `dispute.${dto.status.toLowerCase()}`,
        aggregateType: 'Dispute',
        aggregateId: updated.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.requestId,
        metadata: { dispute: updated },
      });

      return updated;
    });
  }
}
