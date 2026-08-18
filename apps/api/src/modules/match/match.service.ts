import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
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

  @IsOptional()
  @IsUUID('4')
  submittedById?: string;
}

@Injectable()
export class MatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

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

  async submitMatchResult(dto: SubmitMatchResultDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const match = await tx.match.findUnique({
        where: { id: dto.matchId },
        include: { fixture: true, result: true },
      });

      if (!match) throw new NotFoundException('Match not found');
      if (['ARCHIVED', 'VOID', 'CONFIRMED'].includes(match.status)) {
        throw new BadRequestException('Cannot submit a result for this match');
      }
      if (match.result) throw new BadRequestException('Result has already been submitted for this match');

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

      const updatedMatch = await tx.match.update({
        where: { id: match.id },
        data: { status: 'SUBMISSION_PENDING' },
      });

      await this.outboxService.enqueueEvent(tx, {
        eventName: 'match.result.submitted',
        aggregateType: 'Match',
        aggregateId: match.id,
        metadata: {
          result: { result: createdResult, match: updatedMatch },
          submittedBy: dto.submittedById,
        },
      });

      return { result: createdResult, match: updatedMatch };
    });
  }

  async confirmMatchResult(matchId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { result: true },
      });

      if (!match || !match.result) throw new NotFoundException('Match result not found');
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

      const updatedMatch = await tx.match.update({
        where: { id: match.id },
        data: { status: 'CONFIRMED', ended_at: now },
      });

      await this.outboxService.enqueueEvent(tx, {
        eventName: 'match.result.confirmed',
        aggregateType: 'Match',
        aggregateId: match.id,
        metadata: { match: updatedMatch, result: confirmedResult },
      });

      return { match: updatedMatch, result: confirmedResult };
    });
  }
}
