import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';

export interface RegisterParticipantInput {
  playerId: string;
  seed?: number;
}

export interface ParticipationActor {
  id?: string;
  role?: string;
  correlationId?: string;
}

@Injectable()
export class ParticipationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async listParticipants(seasonId: string, divisionId: string) {
    const division = await this.prisma.division.findUnique({ where: { id: divisionId } });
    if (!division || division.season_id !== seasonId) throw new NotFoundException('Division not found for this season');

    return this.prisma.divisionParticipant.findMany({
      where: { season_id: seasonId, division_id: divisionId },
      include: { player: true },
      orderBy: [{ status: 'asc' }, { seed: 'asc' }, { registered_at: 'asc' }],
    });
  }

  async register(
    seasonId: string,
    divisionId: string,
    input: RegisterParticipantInput,
    actor?: ParticipationActor,
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.findUnique({ where: { id: seasonId } });
      if (!season) throw new NotFoundException('Season not found');
      if (season.status !== 'REGISTRATION_OPEN') {
        throw new BadRequestException('Player registration is not open for this season');
      }
      if (season.registration_close_at && new Date() >= season.registration_close_at) {
        throw new BadRequestException('Season registration is closed');
      }

      const division = await tx.division.findUnique({ where: { id: divisionId } });
      if (!division || division.season_id !== seasonId || !division.active) {
        throw new BadRequestException('Division is not active in this season');
      }

      const player = await tx.playerProfile.findUnique({ where: { id: input.playerId } });
      if (!player) throw new NotFoundException('Player not found');

      const privileged = actor?.role === 'HQ_ADMIN' || actor?.role === 'COMMISSIONER';
      if (!privileged && actor?.id !== player.user_id) {
        throw new BadRequestException('Players may only register themselves');
      }
      if (player.verification_status !== 'VERIFIED') {
        throw new BadRequestException('Player must be verified before entering a season');
      }
      if (['SUSPENDED', 'BANNED', 'ARCHIVED', 'RETIRED'].includes(player.player_status)) {
        throw new BadRequestException('Player is not eligible to participate');
      }

      const existing = await tx.divisionParticipant.findUnique({
        where: { season_id_player_id: { season_id: seasonId, player_id: input.playerId } },
      });

      if (existing) {
        if (existing.division_id !== divisionId) {
          throw new BadRequestException('Player is already registered in another division for this season');
        }
        if (existing.status === 'ACTIVE') {
          throw new BadRequestException('Player is already registered in this division');
        }

        const participant = await tx.divisionParticipant.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', withdrawn_at: null, seed: input.seed ?? existing.seed },
          include: { player: true, division: true },
        });

        await this.outbox.enqueueEvent(tx, {
          eventName: 'season.player_registered',
          aggregateType: 'DivisionParticipant',
          aggregateId: participant.id,
          actorId: actor?.id,
          actorRole: actor?.role,
          correlationId: actor?.correlationId,
          metadata: { participant },
        });
        return participant;
      }

      if (division.capacity !== null) {
        const activeCount = await tx.divisionParticipant.count({
          where: { division_id: divisionId, status: 'ACTIVE' },
        });
        if (activeCount >= division.capacity) {
          throw new BadRequestException('Division has reached its participant capacity');
        }
      }

      const participant = await tx.divisionParticipant.create({
        data: {
          season_id: seasonId,
          division_id: divisionId,
          player_id: input.playerId,
          seed: input.seed,
          status: 'ACTIVE',
        },
        include: { player: true, division: true },
      });

      await this.outbox.enqueueEvent(tx, {
        eventName: 'season.player_registered',
        aggregateType: 'DivisionParticipant',
        aggregateId: participant.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId,
        metadata: { participant },
      });

      return participant;
    });
  }

  async withdraw(seasonId: string, playerId: string, actor?: ParticipationActor) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const participant = await tx.divisionParticipant.findUnique({
        where: { season_id_player_id: { season_id: seasonId, player_id: playerId } },
        include: { season: true, player: true },
      });
      if (!participant) throw new NotFoundException('Season participation not found');
      if (participant.status !== 'ACTIVE') throw new BadRequestException('Player is not actively registered');
      if (!['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(participant.season.status)) {
        throw new BadRequestException('Player withdrawal is no longer permitted');
      }

      const privileged = actor?.role === 'HQ_ADMIN' || actor?.role === 'COMMISSIONER';
      if (!privileged && actor?.id !== participant.player.user_id) {
        throw new BadRequestException('Players may only withdraw themselves');
      }

      const updated = await tx.divisionParticipant.update({
        where: { id: participant.id },
        data: { status: 'WITHDRAWN', withdrawn_at: new Date() },
      });

      await this.outbox.enqueueEvent(tx, {
        eventName: 'season.player_withdrawn',
        aggregateType: 'DivisionParticipant',
        aggregateId: updated.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId,
        metadata: { participant: updated },
      });

      return updated;
    });
  }
}
