import { Injectable } from '@nestjs/common';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, IsArray, ArrayUnique } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '@prisma/client';

export class CreateSeasonDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  divisionIds?: string[];
}

@Injectable()
export class SeasonService {
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxService, private readonly auditService: AuditService) {}

  private validTransitions: Record<string, string[]> = {
    DRAFT: ['REGISTRATION_OPEN', 'ARCHIVED'],
    REGISTRATION_OPEN: ['REGISTRATION_CLOSED', 'ARCHIVED'],
    REGISTRATION_CLOSED: ['ACTIVE', 'ARCHIVED'],
    ACTIVE: ['PLAYOFFS', 'COMPLETED', 'ARCHIVED'],
    PLAYOFFS: ['COMPLETED', 'ARCHIVED'],
    COMPLETED: ['ARCHIVED'],
    ARCHIVED: [],
  };

  async listSeasons() {
    return this.prisma.season.findMany({
      include: {
        divisions: {
          include: { fixtures: true, match_weeks: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async createSeason(dto: CreateSeasonDto, actor?: { id?: string; role?: string; requestId?: string; correlationId?: string }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.create({
        data: {
          name: dto.name,
          description: undefined,
          status: 'DRAFT',
          start_date: new Date(dto.startDate),
          end_date: new Date(dto.endDate),
        },
      });

      // If divisions were provided (pre-created), attach them to this season
      if (dto.divisionIds && dto.divisionIds.length) {
        await tx.division.updateMany({ where: { id: { in: dto.divisionIds } }, data: { season_id: season.id } });
      } else {
        // create a default division and a first match week
        const division = await tx.division.create({
          data: { season_id: season.id, name: 'Division 1', description: 'Auto-created division' },
        });

        await tx.matchWeek.create({
          data: { season_id: season.id, division_id: division.id, week_number: 1 },
        });
      }

      await this.outbox.enqueueEvent(tx, {
        eventName: 'season.created',
        aggregateType: 'Season',
        aggregateId: season.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId ?? actor?.requestId,
        metadata: { season },
      });

      return season;
    });
  }

  private async changeStatus(tx: Prisma.TransactionClient, seasonId: string, newStatus: string, actor?: { id?: string; role?: string; correlationId?: string }, metadata?: any) {
    const season = await tx.season.findUnique({ where: { id: seasonId } });
    if (!season) throw new Error('Season not found');
    const allowed = this.validTransitions[season.status as string] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid season transition from ${season.status} to ${newStatus}`);
    }

    const updateData: any = { status: newStatus };
    if (newStatus === 'REGISTRATION_OPEN') {
      updateData.registration_open_at = new Date();
      if (!season.registration_close_at && season.start_date) {
        updateData.registration_close_at = new Date(season.start_date);
        updateData.registration_close_at.setDate(updateData.registration_close_at.getDate() - 1);
      }
    }
    if (newStatus === 'REGISTRATION_CLOSED') {
      updateData.registration_close_at = new Date();
    }
    if (newStatus === 'ACTIVE') {
      if (season.registration_close_at && new Date() < new Date(season.registration_close_at)) {
        throw new Error('Cannot activate season until registration is closed');
      }
    }

    const updated = await tx.season.update({ where: { id: seasonId }, data: updateData });

    await this.outbox.enqueueEvent(tx, {
      eventName: `season.${newStatus.toLowerCase()}`,
      aggregateType: 'Season',
      aggregateId: seasonId,
      actorId: actor?.id,
      actorRole: actor?.role,
      correlationId: actor?.correlationId,
      metadata: metadata ?? { before: season, after: updated },
    });

    // write audit log for the transition
    try {
      await this.auditService.writeLog({
        entityType: 'Season',
        entityId: seasonId,
        action: `transition:${season.status}->${newStatus}`,
        actorId: actor?.id,
        actorRole: actor?.role,
        beforeState: season,
        afterState: updated,
        requestId: actor?.correlationId,
        correlationId: actor?.correlationId,
      });
    } catch (err) {
      // don't block transition if audit write fails, but log via outbox metadata
    }

    return updated;
  }

  async publishSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx: Prisma.TransactionClient) => this.changeStatus(tx, seasonId, 'REGISTRATION_OPEN', actor));
  }

  async closeRegistration(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx: Prisma.TransactionClient) => this.changeStatus(tx, seasonId, 'REGISTRATION_CLOSED', actor));
  }

  async activateSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx: Prisma.TransactionClient) => this.changeStatus(tx, seasonId, 'ACTIVE', actor));
  }

  async startPlayoffs(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx: Prisma.TransactionClient) => this.changeStatus(tx, seasonId, 'PLAYOFFS', actor));
  }

  async completeSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx: Prisma.TransactionClient) => this.changeStatus(tx, seasonId, 'COMPLETED', actor));
  }

  async archiveSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx: Prisma.TransactionClient) => this.changeStatus(tx, seasonId, 'ARCHIVED', actor));
  }

  // Division CRUD scoped to season
  async createDivision(seasonId: string, data: { name: string; type?: string; capacity?: number; active?: boolean }, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.findUnique({ where: { id: seasonId } });
      if (!season) throw new Error('Season not found');
      const division = await tx.division.create({ data: { season_id: seasonId, name: data.name, type: (data.type as any) ?? 'AMATEUR', capacity: data.capacity ?? 10, active: data.active ?? true } });
      await this.outbox.enqueueEvent(tx, {
        eventName: 'division.created',
        aggregateType: 'Division',
        aggregateId: division.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId,
        metadata: { division },
      });
      return division;
    });
  }

  async updateDivision(divisionId: string, data: { name?: string; capacity?: number; active?: boolean; type?: string }, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const before = await tx.division.findUnique({ where: { id: divisionId } });
      if (!before) throw new Error('Division not found');
      const updated = await tx.division.update({ where: { id: divisionId }, data: { name: data.name ?? before.name, capacity: data.capacity ?? before.capacity, active: data.active ?? before.active, type: (data.type as any) ?? before.type } });
      await this.outbox.enqueueEvent(tx, {
        eventName: 'division.updated',
        aggregateType: 'Division',
        aggregateId: divisionId,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId,
        metadata: { before, after: updated },
      });
      return updated;
    });
  }

  async deactivateDivision(divisionId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const before = await tx.division.findUnique({ where: { id: divisionId } });
      if (!before) throw new Error('Division not found');
      const updated = await tx.division.update({ where: { id: divisionId }, data: { active: false } });
      await this.outbox.enqueueEvent(tx, {
        eventName: 'division.deactivated',
        aggregateType: 'Division',
        aggregateId: divisionId,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId,
        metadata: { before, after: updated },
      });
      return updated;
    });
  }
}
