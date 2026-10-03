import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';

export class CreateMatchDto {
  @IsUUID('4')
  seasonId!: string;

  @IsUUID('4')
  divisionId!: string;

  @IsUUID('4')
  homePlayerId!: string;

  @IsUUID('4')
  awayPlayerId!: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsUUID('4')
  matchWeekId?: string;
}

export class SubmitMatchResultDto {
  @IsUUID('4')
  matchId!: string;

  @IsInt()
  @Min(0)
  homeScore!: number;

  @IsInt()
  @Min(0)
  awayScore!: number;
}

export class TransitionMatchDto {
  @IsEnum(MatchStatus)
  status!: MatchStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export interface MatchTransitionActor {
  id?: string;
  roles?: string[];
  operatorProfile?: { assigned_division_id?: string | null } | null;
  correlationId?: string;
}

export const VALID_MATCH_TRANSITIONS: Record<MatchStatus, readonly MatchStatus[]> = {
  DRAFT: [MatchStatus.SCHEDULED, MatchStatus.CANCELLED],
  SCHEDULED: [MatchStatus.CHECK_IN_OPEN, MatchStatus.CANCELLED],
  CHECK_IN_OPEN: [MatchStatus.CHECKED_IN, MatchStatus.CANCELLED],
  CHECK_IN_CLOSED: [MatchStatus.IN_PROGRESS, MatchStatus.DISPUTED, MatchStatus.CANCELLED],
  CHECKED_IN: [MatchStatus.IN_PROGRESS, MatchStatus.CANCELLED],
  IN_PROGRESS: [MatchStatus.AWAITING_RESULT, MatchStatus.RESULT_SUBMITTED, MatchStatus.DISPUTED, MatchStatus.CANCELLED],
  AWAITING_RESULT: [MatchStatus.RESULT_SUBMITTED, MatchStatus.UNDER_REVIEW, MatchStatus.DISPUTED, MatchStatus.CANCELLED],
  RESULT_SUBMITTED: [MatchStatus.UNDER_REVIEW, MatchStatus.COMPLETED, MatchStatus.DISPUTED, MatchStatus.CANCELLED],
  SUBMISSION_PENDING: [MatchStatus.RESULT_SUBMITTED, MatchStatus.UNDER_REVIEW, MatchStatus.COMPLETED, MatchStatus.DISPUTED, MatchStatus.CANCELLED],
  UNDER_REVIEW: [MatchStatus.COMPLETED, MatchStatus.DISPUTED, MatchStatus.CANCELLED],
  DISPUTED: [MatchStatus.UNDER_REVIEW, MatchStatus.COMPLETED, MatchStatus.CANCELLED],
  CONFIRMED: [MatchStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
  FORFEITED: [],
  VOID: [],
  ARCHIVED: [],
};

export interface MatchResultActor extends MatchTransitionActor {
  id: string;
}

@Injectable()
export class MatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  async transitionMatch(matchId: string, status: MatchStatus, actor: MatchTransitionActor, reason?: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { fixture: true, result: true },
      });
      if (!match) throw new NotFoundException('Match not found');
      this.assertOperatorScope(match.division_id, actor);
      return this.applyTransition(tx, match, status, actor, reason);
    });
  }

  private assertOperatorScope(divisionId: string, actor: MatchTransitionActor) {
    if (!actor.roles?.includes('OPERATOR')) return;
    if (!actor.operatorProfile?.assigned_division_id) {
      throw new ForbiddenException('Operator division scope is required for match operations');
    }
    if (actor.operatorProfile.assigned_division_id !== divisionId) {
      throw new ForbiddenException('Operator may not act outside the assigned division');
    }
  }

  private async applyTransition(
    tx: Prisma.TransactionClient,
    match: any,
    nextStatus: MatchStatus,
    actor: MatchTransitionActor,
    reason?: string,
  ) {
    if (!VALID_MATCH_TRANSITIONS[match.status as MatchStatus]?.includes(nextStatus)) {
      throw new BadRequestException(`Invalid match transition from ${match.status} to ${nextStatus}`);
    }
    if (['CANCELLED', 'DISPUTED'].includes(nextStatus) && !reason?.trim()) {
      throw new BadRequestException(`A reason is required when transitioning a match to ${nextStatus}`);
    }

    const now = new Date();
    if (nextStatus === MatchStatus.CHECK_IN_OPEN) {
      const opens = match.fixture?.check_in_opens_at;
      const closes = match.fixture?.check_in_closes_at;
      if (!opens || !closes || now < opens || now >= closes) {
        throw new BadRequestException('Check-in can only be opened during the configured check-in window');
      }
    }
    if (nextStatus === MatchStatus.CHECKED_IN) {
      const closes = match.fixture?.check_in_closes_at;
      if (!closes || now >= closes) {
        throw new BadRequestException('Participants can only be checked in before the configured check-in window closes');
      }
    }
    if (nextStatus === MatchStatus.IN_PROGRESS) {
      const opens = match.fixture?.play_window_opens_at;
      const closes = match.fixture?.play_window_closes_at;
      if (!opens || !closes || now < opens || now > closes) {
        throw new BadRequestException('A match can only start during its configured play window');
      }
    }
    if (nextStatus === MatchStatus.RESULT_SUBMITTED) {
      const result = await tx.matchResult.findUnique({ where: { match_id: match.id }, select: { id: true } });
      if (!result) throw new BadRequestException('A result must exist before entering RESULT_SUBMITTED');
    }
    if (nextStatus === MatchStatus.COMPLETED && !match.result?.confirmed_at) {
      throw new BadRequestException('A confirmed result is required before completing a match');
    }

    const updated = await tx.match.update({
      where: { id: match.id },
      data: {
        status: nextStatus,
        started_at: nextStatus === MatchStatus.IN_PROGRESS ? now : undefined,
       ended_at: new Set<MatchStatus>([
  MatchStatus.COMPLETED,
  MatchStatus.CANCELLED,
]).has(nextStatus)
  ? now
  : undefined,
      },
    });
    await tx.matchStatusTransition.create({
      data: {
        match_id: match.id,
        from_status: match.status,
        to_status: nextStatus,
        actor_id: actor.id,
        actor_role: actor.roles?.[0],
        reason: reason?.trim() || null,
        correlation_id: actor.correlationId,
        transitioned_at: now,
      },
    });
    await this.outboxService.enqueueEvent(tx, {
      eventName: 'match.status.transitioned',
      aggregateType: 'Match',
      aggregateId: match.id,
      actorId: actor.id,
      actorRole: actor.roles?.[0],
      correlationId: actor.correlationId,
      reason: reason?.trim(),
      metadata: { fromStatus: match.status, toStatus: nextStatus, transitionedAt: now },
    });
    return updated;
  }

  async listMatches() {
    return this.prisma.match.findMany({
      include: {
        fixture: {
          include: {
            home_player: true,
            away_player: true,
            match_week: true,
          },
        },
        participants: { include: { player: true } },
        result: { include: { winner_player: true } },
        disputes: true,
        penalties: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async createMatch(dto: CreateMatchDto) {
    if (dto.homePlayerId === dto.awayPlayerId) {
      throw new BadRequestException('Home and away players must be different');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.findUnique({ where: { id: dto.seasonId } });
      if (!season) throw new NotFoundException('Season not found');
      if (!['ACTIVE', 'PLAYOFFS'].includes(season.status)) {
        throw new BadRequestException('Matches can only be created for active or playoff seasons');
      }

      const division = await tx.division.findUnique({ where: { id: dto.divisionId } });
      if (!division || division.season_id !== dto.seasonId || !division.active) {
        throw new BadRequestException('Division does not belong to the season or is inactive');
      }

      if (dto.matchWeekId) {
        const week = await tx.matchWeek.findUnique({ where: { id: dto.matchWeekId } });
        if (!week || week.season_id !== dto.seasonId || week.division_id !== dto.divisionId) {
          throw new BadRequestException('Match week does not belong to the selected season and division');
        }
      }

      const participants = await tx.divisionParticipant.findMany({
        where: {
          season_id: dto.seasonId,
          division_id: dto.divisionId,
          player_id: { in: [dto.homePlayerId, dto.awayPlayerId] },
          status: 'ACTIVE',
        },
      });
      if (participants.length !== 2) {
        throw new BadRequestException('Both players must be active participants in the selected division');
      }

      const existingPair = await tx.fixture.findFirst({
        where: {
          division_id: dto.divisionId,
          OR: [
            { home_player_id: dto.homePlayerId, away_player_id: dto.awayPlayerId },
            { home_player_id: dto.awayPlayerId, away_player_id: dto.homePlayerId },
          ],
        },
        select: { id: true },
      });
      if (existingPair) {
        throw new BadRequestException('A fixture already exists for these two players in this division');
      }

      const fixtureStatus = dto.scheduledAt ? 'SCHEDULED' : 'DRAFT';
      const matchStatus = dto.scheduledAt ? 'SCHEDULED' : 'DRAFT';

      const fixture = await tx.fixture.create({
        data: {
          division_id: dto.divisionId,
          match_week_id: dto.matchWeekId,
          home_player_id: dto.homePlayerId,
          away_player_id: dto.awayPlayerId,
          scheduled_at: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          status: fixtureStatus,
        },
      });

      const match = await tx.match.create({
        data: {
          fixture_id: fixture.id,
          season_id: dto.seasonId,
          division_id: dto.divisionId,
          status: matchStatus,
        },
      });

      await tx.matchParticipant.createMany({
        data: [
          { match_id: match.id, player_id: dto.homePlayerId, role: 'HOME' },
          { match_id: match.id, player_id: dto.awayPlayerId, role: 'AWAY' },
        ],
      });

      await this.outboxService.enqueueEvent(tx, {
        eventName: 'match.created',
        aggregateType: 'Match',
        aggregateId: match.id,
        metadata: { match, fixture },
      });

      return match;
    });
  }

  async submitMatchResult(dto: SubmitMatchResultDto, actor: MatchResultActor) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const match = await tx.match.findUnique({
        where: { id: dto.matchId },
        include: {
          fixture: {
            include: {
              home_player: { select: { user_id: true } },
              away_player: { select: { user_id: true } },
            },
          },
          result: true,
        },
      });

      if (!match) throw new NotFoundException('Match not found');
      if (!new Set<MatchStatus>([
  MatchStatus.IN_PROGRESS,
  MatchStatus.AWAITING_RESULT,
]).has(match.status as MatchStatus)) {
        throw new BadRequestException('Cannot submit a result for this match');
      }
      this.assertOperatorScope(match.division_id, actor);
      if (match.result) throw new BadRequestException('Result has already been submitted for this match');

      const isParticipant = [
        match.fixture.home_player.user_id,
        match.fixture.away_player.user_id,
      ].includes(actor.id);

      const isOperator = actor.roles?.includes('OPERATOR') ?? false;
      let isClubManager = false;

      if (!isParticipant && (actor.roles?.includes('CLUB_MANAGER') ?? false)) {
        const clubMembership = await tx.clubMember.findFirst({
          where: {
            user_id: actor.id,
            role: 'MANAGER',
            status: 'ACTIVE',
            club: {
              members: {
                some: {
                  user_id: {
                    in: [
                      match.fixture.home_player.user_id,
                      match.fixture.away_player.user_id,
                    ],
                  },
                  status: 'ACTIVE',
                },
              },
            },
          },
          select: { id: true },
        });

        isClubManager = Boolean(clubMembership);
      }

      if (!isParticipant && !isOperator && !isClubManager) {
        throw new ForbiddenException('Only match participants, their club manager, or an operator may submit a match result');
      }

      const winnerPlayerId = dto.homeScore > dto.awayScore
        ? match.fixture.home_player_id
        : dto.awayScore > dto.homeScore
          ? match.fixture.away_player_id
          : null;

      const createdResult = await tx.matchResult.create({
        data: {
          match_id: match.id,
          home_score: dto.homeScore,
          away_score: dto.awayScore,
          winner_player_id: winnerPlayerId,
        },
      });

      let currentMatch = match;

if (currentMatch.status === MatchStatus.IN_PROGRESS) {
  await this.applyTransition(
    tx,
    currentMatch,
    MatchStatus.AWAITING_RESULT,
    actor,
  );

  currentMatch = {
    ...currentMatch,
    status: MatchStatus.AWAITING_RESULT,
  };
}

const updatedMatch = await this.applyTransition(
  tx,
  { ...currentMatch, result: createdResult },
  MatchStatus.RESULT_SUBMITTED,
  actor,
);

      await this.outboxService.enqueueEvent(tx, {
        eventName: 'match.result.submitted',
        aggregateType: 'Match',
        aggregateId: match.id,
        actorId: actor.id,
        actorRole: actor.roles?.[0],
        metadata: {
          result: { result: createdResult, match: updatedMatch },
          submittedBy: actor.id,
        },
      });

      return { result: createdResult, match: updatedMatch };
    });
  }

  async confirmMatchResult(matchId: string, actor: MatchTransitionActor = {}) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { result: true },
      });

      if (!match || !match.result) throw new NotFoundException('Match result not found');
      this.assertOperatorScope(match.division_id, actor);
      if (match.status === 'VOID' || match.status === 'ARCHIVED') {
        throw new BadRequestException('Cannot confirm a void or archived match');
      }
      if (match.result.confirmed_at) {
        throw new BadRequestException('Match result is already confirmed');
      }

      const now = new Date();
      const confirmedResult = await tx.matchResult.update({
        where: { match_id: match.id },
        data: { confirmed_at: now },
      });

      const updatedMatch = await this.applyTransition(
        tx,
        { ...match, result: confirmedResult },
        MatchStatus.COMPLETED,
        actor,
      );

      await this.outboxService.enqueueEvent(tx, {
        eventName: 'match.result.confirmed',
        aggregateType: 'Match',
        aggregateId: match.id,
        actorId: actor.id,
        actorRole: actor.roles?.[0],
        correlationId: actor.correlationId,
        metadata: { match: updatedMatch, result: confirmedResult },
      });

      return { match: updatedMatch, result: confirmedResult };
    });
  }
}
