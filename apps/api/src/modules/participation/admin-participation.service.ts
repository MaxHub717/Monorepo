import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ParticipationStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isEligiblePlayerProfile } from './eligibility.js';
import { AdminBulkRegisterParticipantDto, AdminBulkUpdateParticipantDto, AdminRegisterParticipantDto, AdminUpdateParticipantDto } from './dto/admin-participation.dto.js';

export interface AdminParticipationActor {
  id?: string;
  role?: string;
  correlationId?: string;
}

@Injectable()
export class AdminParticipationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async listParticipants(seasonId: string) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId }, select: { id: true, name: true, status: true } });
    if (!season) throw new NotFoundException('Season not found');

    return this.prisma.divisionParticipant.findMany({
      where: { season_id: seasonId },
      include: {
        player: { include: { user: { select: { id: true, email: true, username: true } } } },
        division: { select: { id: true, name: true, type: true, format: true, capacity: true, registration_capacity: true, competition_participant_count: true, active: true } },
      },
      orderBy: [{ status: 'asc' }, { division: { name: 'asc' } }, { seed: 'asc' }, { registered_at: 'asc' }],
    });
  }

  async register(seasonId: string, dto: AdminRegisterParticipantDto, actor: AdminParticipationActor) {
    return this.prisma.$transaction(async (tx) => {
      const season = await this.requireSeason(tx, seasonId);
      if (season.status !== 'REGISTRATION_OPEN') throw new BadRequestException('Administrative registration is only available while registration is open');
      const player = await tx.playerProfile.findUnique({ where: { id: dto.playerId } });
      if (!player) throw new NotFoundException('Player not found');
      if (!isEligiblePlayerProfile(player)) throw new BadRequestException('Player is not eligible to participate');
      const division = await this.requireDivision(tx, seasonId, dto.divisionId);
      const existing = await tx.divisionParticipant.findUnique({ where: { season_id_player_id: { season_id: seasonId, player_id: dto.playerId } } });
      if (existing?.status === 'ACTIVE') throw new BadRequestException('Player is already actively registered in this season');
      await this.ensureRegistrationCapacity(tx, division.id, existing?.division_id === division.id ? existing.id : undefined);

      const participant = existing
        ? await tx.divisionParticipant.update({ where: { id: existing.id }, data: { division_id: division.id, status: 'ACTIVE', seed: dto.seed ?? existing.seed, withdrawn_at: null }, include: { player: true, division: true } })
        : await tx.divisionParticipant.create({ data: { season_id: seasonId, division_id: division.id, player_id: dto.playerId, status: 'ACTIVE', seed: dto.seed }, include: { player: true, division: true } });

      await this.record(tx, 'season.admin_participant_registered', 'admin_participant_registered', participant.id, actor, dto.reason, undefined, participant);
      return participant;
    });
  }

  async bulkRegister(seasonId: string, dto: AdminBulkRegisterParticipantDto, actor: AdminParticipationActor) {
    return this.prisma.$transaction(async (tx) => {
      const season = await this.requireSeason(tx, seasonId);
      if (season.status !== 'REGISTRATION_OPEN') throw new BadRequestException('Administrative registration is only available while registration is open');
      if (!dto.participants?.length) throw new BadRequestException('At least one participant must be supplied');

      const results: any[] = [];
      for (const item of dto.participants) {
        const existing = await tx.divisionParticipant.findUnique({ where: { season_id_player_id: { season_id: seasonId, player_id: item.playerId } } });
        const player = await tx.playerProfile.findUnique({ where: { id: item.playerId } });
        if (!player) throw new NotFoundException(`Player ${item.playerId} not found`);
        if (!isEligiblePlayerProfile(player)) throw new BadRequestException(`Player ${item.playerId} is not eligible to participate`);
        const division = await this.requireDivision(tx, seasonId, item.divisionId);
        if (existing?.status === 'ACTIVE') throw new BadRequestException(`Player ${item.playerId} is already actively registered in this season`);
        await this.ensureRegistrationCapacity(tx, division.id, existing?.division_id === division.id ? existing.id : undefined);
        const participant = existing
          ? await tx.divisionParticipant.update({ where: { id: existing.id }, data: { division_id: division.id, status: 'ACTIVE', seed: item.seed ?? existing.seed, withdrawn_at: null }, include: { player: true, division: true } })
          : await tx.divisionParticipant.create({ data: { season_id: seasonId, division_id: division.id, player_id: item.playerId, status: 'ACTIVE', seed: item.seed }, include: { player: true, division: true } });
        await this.record(tx, 'season.admin_participant_registered', 'admin_participant_registered', participant.id, actor, item.reason, undefined, participant);
        results.push(participant);
      }
      return results;
    });
  }

  async update(seasonId: string, participantId: string, dto: AdminUpdateParticipantDto, actor: AdminParticipationActor) {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.divisionParticipant.findFirst({ where: { id: participantId, season_id: seasonId }, include: { season: true, player: true, division: true } });
      if (!participant) throw new NotFoundException('Season participant not found');
      if (['ROSTER_LOCKED', 'ACTIVE', 'PLAYOFFS', 'COMPLETED', 'ARCHIVED'].includes(participant.season.status)) {
        throw new BadRequestException('Participant changes are locked after roster lock');
      }
      const nextStatus = (dto.status as ParticipationStatus | undefined) ?? participant.status;
      const nextDivision = dto.divisionId ? await this.requireDivision(tx, seasonId, dto.divisionId) : participant.division;
      if (nextStatus === 'ACTIVE') await this.ensureRegistrationCapacity(tx, nextDivision.id, participant.division_id === nextDivision.id ? participant.id : undefined);

      const updated = await tx.divisionParticipant.update({
        where: { id: participant.id },
        data: {
          status: nextStatus,
          division_id: nextDivision.id,
          seed: dto.seed === undefined ? participant.seed : dto.seed,
          withdrawn_at: nextStatus === 'ACTIVE' ? null : participant.withdrawn_at ?? new Date(),
        },
        include: { player: true, division: true },
      });
      await this.record(tx, `season.admin_participant_${nextStatus.toLowerCase()}`, 'admin_participant_updated', participant.id, actor, dto.reason, participant, updated);
      return updated;
    });
  }

  async bulkUpdate(seasonId: string, dto: AdminBulkUpdateParticipantDto, actor: AdminParticipationActor) {
    return this.prisma.$transaction(async (tx) => {
      const results: any[] = [];
      for (const item of dto.participants) {
        const participant = await tx.divisionParticipant.findFirst({ where: { id: item.participantId, season_id: seasonId }, include: { season: true, player: true, division: true } });
        if (!participant) throw new NotFoundException(`Season participant ${item.participantId} not found`);
        if (['ROSTER_LOCKED', 'ACTIVE', 'PLAYOFFS', 'COMPLETED', 'ARCHIVED'].includes(participant.season.status)) {
          throw new BadRequestException(`Participant ${item.participantId} changes are locked after roster lock`);
        }
        const nextStatus = (item.status as ParticipationStatus | undefined) ?? participant.status;
        const nextDivision = item.divisionId ? await this.requireDivision(tx, seasonId, item.divisionId) : participant.division;
        if (nextStatus === 'ACTIVE') await this.ensureRegistrationCapacity(tx, nextDivision.id, participant.division_id === nextDivision.id ? participant.id : undefined);
        const updated = await tx.divisionParticipant.update({
          where: { id: participant.id },
          data: {
            status: nextStatus,
            division_id: nextDivision.id,
            seed: item.seed === undefined ? participant.seed : item.seed,
            withdrawn_at: nextStatus === 'ACTIVE' ? null : participant.withdrawn_at ?? new Date(),
          },
          include: { player: true, division: true },
        });
        await this.record(tx, `season.admin_participant_${nextStatus.toLowerCase()}`, 'admin_participant_updated', participant.id, actor, item.reason, participant, updated);
        results.push(updated);
      }
      return results;
    });
  }

  private async requireSeason(tx: Prisma.TransactionClient, seasonId: string) {
    const season = await tx.season.findUnique({ where: { id: seasonId } });
    if (!season) throw new NotFoundException('Season not found');
    return season;
  }

  private async requireDivision(tx: Prisma.TransactionClient, seasonId: string, divisionId: string) {
    const division = await tx.division.findFirst({ where: { id: divisionId, season_id: seasonId, active: true } });
    if (!division) throw new BadRequestException('Division is not active in this season');
    return division;
  }

  private async ensureRegistrationCapacity(tx: Prisma.TransactionClient, divisionId: string, participantId?: string) {
    const division = await tx.division.findUnique({ where: { id: divisionId }, select: { registration_capacity: true } });
    if (division?.registration_capacity === null || division?.registration_capacity === undefined) return;
    const count = await tx.divisionParticipant.count({ where: { division_id: divisionId, ...(participantId ? { id: { not: participantId } } : {}) } });
    if (count >= division.registration_capacity) throw new BadRequestException('Division has reached its registration capacity');
  }

  private async record(tx: Prisma.TransactionClient, eventName: string, action: string, participantId: string, actor: AdminParticipationActor, reason: string, beforeState: unknown, afterState: unknown) {
    await this.outbox.enqueueEvent(tx, { eventName, aggregateType: 'DivisionParticipant', aggregateId: participantId, actorId: actor.id, actorRole: actor.role, correlationId: actor.correlationId, reason, metadata: { reason, beforeState, afterState } });
    try {
      await this.audit.writeLog({ entityType: 'DivisionParticipant', entityId: participantId, action, actorId: actor.id, actorRole: actor.role, correlationId: actor.correlationId, reason, beforeState, afterState, metadata: { administrative: true } });
    } catch {
      // Audit failure must not undo the participant mutation.
    }
  }
}