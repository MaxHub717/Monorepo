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
        league: { select: { id: true, name: true, status: true } },
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

  async getOverview(seasonId: string) {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        league: { select: { id: true, name: true, status: true } },
        divisions: {
          include: {
            _count: { select: { participants: true, fixtures: true, matches: true, standings_rows: true } },
          },
          orderBy: { name: 'asc' },
        },
        _count: { select: { divisions: true, participants: true, matches: true, standings_rows: true } },
      },
    });
    if (!season) throw new NotFoundException('Season not found');

    const [fixtureCount, pendingResultCount, disputeCount, penaltyCount, confirmedMatchCount] = await Promise.all([
      this.prisma.fixture.count({ where: { division: { season_id: seasonId } } }),
      this.prisma.match.count({ where: { season_id: seasonId, status: { in: ['SUBMISSION_PENDING', 'UNDER_REVIEW'] } } }),
      this.prisma.dispute.count({ where: { match: { season_id: seasonId }, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'] } } }),
      this.prisma.penalty.count({ where: { match: { season_id: seasonId }, status: { in: ['PROPOSED', 'UNDER_REVIEW', 'APPROVED'] } } }),
      this.prisma.match.count({ where: { season_id: seasonId, status: { in: ['CONFIRMED', 'ARCHIVED'] } } }),
    ]);

    const readiness = await this.getTransitionReadiness(seasonId, season.status, fixtureCount, confirmedMatchCount);

    const nextAction = {
      DRAFT: { label: 'Open registration', endpoint: 'publish', reason: 'Complete configuration before accepting participants.' },
      REGISTRATION_OPEN: { label: 'Close registration', endpoint: 'close-registration', reason: 'Finalize the participant pool when registration ends.' },
      REGISTRATION_CLOSED: { label: 'Lock roster', endpoint: 'lock-roster', reason: 'Verify eligible participants before generating fixtures.' },
      ROSTER_LOCKED: { label: 'Activate season', endpoint: 'activate', reason: 'Ensure the fixture schedule is generated before activation.' },
      ACTIVE: { label: 'Start playoffs', endpoint: 'start-playoffs', reason: 'Move to playoffs after the regular season is complete.' },
      PLAYOFFS: { label: 'Complete season', endpoint: 'complete', reason: 'Finalize the champion and season record.' },
      COMPLETED: { label: 'Archive season', endpoint: 'archive', reason: 'Make the completed season historical and read-only.' },
      ARCHIVED: null,
    }[season.status];

    return {
      id: season.id,
      name: season.name,
      description: season.description,
      status: season.status,
      start_date: season.start_date,
      end_date: season.end_date,
      registration_open_at: season.registration_open_at,
      registration_close_at: season.registration_close_at,
      league: season.league,
      counts: {
        participants: season._count.participants,
        divisions: season._count.divisions,
        fixtures: fixtureCount,
        matches: season._count.matches,
        pendingResults: pendingResultCount,
        disputes: disputeCount,
        penalties: penaltyCount,
        confirmedMatches: confirmedMatchCount,
      },
      divisions: season.divisions,
      nextAction,
      readiness,
    };
  }

  private async getTransitionReadiness(seasonId: string, status: string, fixtureCount: number, confirmedMatchCount: number) {
    const divisions = await this.prisma.division.findMany({
      where: { season_id: seasonId, active: true },
      select: { id: true, name: true, format: true, _count: { select: { participants: true, fixtures: true } } },
    });
    const issues: string[] = [];
    if (['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ROSTER_LOCKED'].includes(status) && !divisions.length) {
      issues.push('At least one active division is required.');
    }
    if (status === 'DRAFT' && !(await this.hasValidSeasonDates(seasonId))) {
      issues.push('Season start and end dates are required before registration opens.');
    }
    if (status === 'REGISTRATION_CLOSED') {
      for (const division of divisions) {
        if (division._count.participants < 2) issues.push(`${division.name} needs at least two active participants.`);
      }
    }
    if (status === 'ROSTER_LOCKED') {
      for (const division of divisions) {
        const expected = division._count.participants * (division._count.participants - 1) / 2 * (division.format === 'ROUND_ROBIN_DOUBLE' ? 2 : 1);
        if (division._count.fixtures !== expected) issues.push(`${division.name} needs ${expected} generated fixtures before activation.`);
      }
    }
    if (status === 'ACTIVE' && (confirmedMatchCount < fixtureCount || fixtureCount === 0)) {
      issues.push('All regular-season matches must be confirmed before playoffs can begin.');
    }
    return { canAdvance: issues.length === 0, issues };
  }

  private async hasValidSeasonDates(seasonId: string) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId }, select: { start_date: true, end_date: true } });
    return Boolean(season?.start_date && season.end_date && season.end_date > season.start_date);
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
      const league = await tx.league.findFirst({
        where: { id: dto.leagueId, status: 'ACTIVE', deleted_at: null },
        select: { id: true },
      });
      if (!league) throw new NotFoundException('Active league not found');

      const season = await tx.season.create({
        // A season is always created inside an active permanent league.
        data: {
          league_id: dto.leagueId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          status: 'DRAFT',
          start_date: startDate,
          end_date: endDate,
        },
      });

      const division = await tx.division.create({
        data: {
          season_id: season.id,
          name: dto.divisionName?.trim() || 'Division 1',
          type: (dto.divisionType as DivisionType | undefined) ?? DivisionType.AMATEUR,
          format: (dto.divisionFormat as CompetitionFormat | undefined) ?? CompetitionFormat.ROUND_ROBIN_SINGLE,
          capacity: dto.divisionCapacity ?? null,
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

    if (newStatus === 'PLAYOFFS') {
      const pending = await tx.match.count({ where: { season_id: seasonId, status: { notIn: ['CONFIRMED', 'ARCHIVED', 'VOID', 'FORFEITED'] } } });
      if (pending > 0) throw new BadRequestException('All regular-season matches must be resolved before playoffs can begin');
      const standingsCount = await tx.standingsRow.count({ where: { season_id: seasonId } });
      if (standingsCount < 4) throw new BadRequestException('At least four standings rows are required before playoffs can begin');
    }

    if (newStatus === 'COMPLETED') {
      if (season.status !== 'PLAYOFFS') throw new BadRequestException('Season must be in playoffs before it can be completed');
      const unresolved = await tx.dispute.count({ where: { match: { season_id: seasonId }, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'] } } });
      if (unresolved > 0) throw new BadRequestException('All disputes must be resolved before completing the season');
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
