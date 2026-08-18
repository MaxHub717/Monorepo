import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  DivisionType,
  CompetitionFormat,
} from '@prisma/client';
import {
  CreateSeasonDto,
  CreateDivisionDto,
  UpdateDivisionDto,
} from './dto/season.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class SeasonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly auditService: AuditService,
  ) {}

  private readonly validTransitions: Record<string, string[]> = {
    DRAFT: ['REGISTRATION_OPEN', 'ARCHIVED'],
    REGISTRATION_OPEN: ['REGISTRATION_CLOSED', 'ARCHIVED'],
    REGISTRATION_CLOSED: ['ROSTER_LOCKED', 'ARCHIVED'],
    ROSTER_LOCKED: ['ACTIVE', 'ARCHIVED'],
    ACTIVE: ['PLAYOFFS', 'COMPLETED', 'ARCHIVED'],
    PLAYOFFS: ['COMPLETED', 'ARCHIVED'],
    COMPLETED: ['ARCHIVED'],
    ARCHIVED: [],
  };

  async listSeasons() {
    return this.prisma.season.findMany({
      include: {
        divisions: {
          include: {
            participants: {
              include: { player: true },
              orderBy: { registered_at: 'asc' },
            },
            fixtures: true,
            match_weeks: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async createSeason(
    dto: CreateSeasonDto,
    actor?: { id?: string; role?: string; requestId?: string; correlationId?: string },
  ) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('Season end date must be after start date');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.create({
        data: {
          name: dto.name.trim(),
          status: 'DRAFT',
          start_date: startDate,
          end_date: endDate,
        },
      });

      const division = await tx.division.create({
        data: {
          season_id: season.id,
          name: 'Division 1',
          description: 'Default player division',
        },
      });


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

  private async changeStatus(
    tx: Prisma.TransactionClient,
    seasonId: string,
    newStatus: string,
    actor?: { id?: string; role?: string; correlationId?: string },
    metadata?: unknown,
  ) {
    const season = await tx.season.findUnique({ where: { id: seasonId } });
    if (!season) throw new NotFoundException('Season not found');

    const allowed = this.validTransitions[season.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Invalid season transition from ${season.status} to ${newStatus}`);
    }

    if (newStatus === 'REGISTRATION_OPEN') {
      if (!season.start_date || !season.end_date) {
        throw new BadRequestException('Season start and end dates are required');
      }
      if (season.end_date <= season.start_date) {
        throw new BadRequestException('Season end date must be after start date');
      }
    }

    if (newStatus === 'ROSTER_LOCKED') {
      const divisions = await tx.division.findMany({
        where: { season_id: seasonId, active: true },
        select: { id: true, name: true },
      });
      if (!divisions.length) throw new BadRequestException('Season must have at least one active division');

      for (const division of divisions) {
        const count = await tx.divisionParticipant.count({
          where: { season_id: seasonId, division_id: division.id, status: 'ACTIVE' },
        });
        if (count < 2) {
          throw new BadRequestException(`Division ${division.name} requires at least two active players before roster lock`);
        }
      }
    }

    if (newStatus === 'ACTIVE') {
      if (season.status !== 'ROSTER_LOCKED') {
        throw new BadRequestException('Season roster must be locked before activation');
      }

      const divisions = await tx.division.findMany({
        where: { season_id: seasonId, active: true },
        select: { id: true, name: true, format: true },
      });
      if (!divisions.length) throw new BadRequestException('Season must have at least one active division');

      for (const division of divisions) {
        const participantCount = await tx.divisionParticipant.count({
          where: { season_id: seasonId, division_id: division.id, status: 'ACTIVE' },
        });
        if (participantCount < 2) {
          throw new BadRequestException(`Division ${division.name} requires at least two active players`);
        }

        const expectedFixtures = (participantCount * (participantCount - 1)) / 2 * (division.format === 'ROUND_ROBIN_DOUBLE' ? 2 : 1);
        const fixtureCount = await tx.fixture.count({ where: { division_id: division.id } });
        if (fixtureCount !== expectedFixtures) {
          throw new BadRequestException(`Division ${division.name} must have a complete generated fixture schedule before activation`);
        }
      }
    }

    const updateData: Prisma.SeasonUpdateInput = { status: newStatus as Prisma.SeasonUpdateInput['status'] };
    if (newStatus === 'REGISTRATION_OPEN') {
      updateData.registration_open_at = new Date();
      if (!season.registration_close_at && season.start_date) {
        const close = new Date(season.start_date);
        close.setDate(close.getDate() - 1);
        updateData.registration_close_at = close;
      }
    }
    if (newStatus === 'REGISTRATION_CLOSED') updateData.registration_close_at = new Date();

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

    try {
      await this.auditService.writeLog({
        entityType: 'Season',
        entityId: seasonId,
        action: `transition:${season.status}->${newStatus}`,
        actorId: actor?.id,
        actorRole: actor?.role,
        beforeState: season,
        afterState: updated,
        correlationId: actor?.correlationId,
        requestId: actor?.correlationId,
      });
    } catch {
      // Audit failure must not roll back the business transition.
    }

    return updated;
  }

  async publishSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'REGISTRATION_OPEN', actor));
  }

  async closeRegistration(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'REGISTRATION_CLOSED', actor));
  }

  async lockRoster(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'ROSTER_LOCKED', actor));
  }

  async activateSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'ACTIVE', actor));
  }

  async startPlayoffs(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'PLAYOFFS', actor));
  }

  async completeSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'COMPLETED', actor));
  }

  async archiveSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'ARCHIVED', actor));
  }

  async createDivision(
    seasonId: string,
    data: { name: string; type?: string; format?: string; capacity?: number; active?: boolean },
    actor?: { id?: string; role?: string; correlationId?: string },
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.findUnique({ where: { id: seasonId } });
      if (!season) throw new NotFoundException('Season not found');
      if (!['DRAFT', 'REGISTRATION_OPEN'].includes(season.status)) {
        throw new BadRequestException('Divisions can only be changed before registration closes');
      }
      if (data.capacity !== undefined && data.capacity < 2) {
        throw new BadRequestException('Division capacity must be at least 2 when specified');
      }

      const division = await tx.division.create({
        data: {
          season_id: seasonId,
          name: data.name.trim(),
          type: (data.type as DivisionType | undefined) ?? DivisionType.AMATEUR,
          format:
            (data.format as CompetitionFormat | undefined) ??
            CompetitionFormat.ROUND_ROBIN_SINGLE,
          capacity: data.capacity ?? null,
          active: data.active ?? true,
        },
      });


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

  async updateDivision(
    divisionId: string,
    data: { name?: string; capacity?: number | null; active?: boolean; type?: string },
    actor?: { id?: string; role?: string; correlationId?: string },
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const before = await tx.division.findUnique({ where: { id: divisionId }, include: { season: true } });
      if (!before) throw new NotFoundException('Division not found');
      if (!['DRAFT', 'REGISTRATION_OPEN'].includes(before.season.status)) {
        throw new BadRequestException('Divisions can only be changed before registration closes');
      }
      if (data.capacity !== undefined && data.capacity !== null && data.capacity < 2) {
        throw new BadRequestException('Division capacity must be at least 2 when specified');
      }

      const updated = await tx.division.update({
        where: { id: divisionId },
        data: {
          name: data.name?.trim() ?? before.name,
          capacity: data.capacity === undefined ? before.capacity : data.capacity,
          active: data.active ?? before.active,
          type: (data.type as DivisionType | undefined) ?? before.type,
        },
      });

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
    return this.updateDivision(divisionId, { active: false }, actor);
  }
}
