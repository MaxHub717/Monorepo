import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsDateString, IsNotEmpty, IsOptional, IsUUID, IsInt, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';

export class CreateMatchDto {
  @IsUUID('4')
  seasonId!: string;

  @IsUUID('4')
  divisionId!: string;

  @IsUUID('4')
  homeClubId!: string;

  @IsUUID('4')
  awayClubId!: string;

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
            home_club: true,
            away_club: true,
            match_week: true,
          },
        },
        participants: { include: { club: true } },
        result: true,
        disputes: true,
        penalties: true,
      },
    });
  }

  async createMatch(dto: CreateMatchDto) {
    if (dto.homeClubId === dto.awayClubId) {
      throw new BadRequestException('Home and away clubs must be different');
    }

    const fixtureStatus = dto.scheduledAt ? 'SCHEDULED' : 'DRAFT';
    const matchStatus = dto.scheduledAt ? 'SCHEDULED' : 'DRAFT';

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const fixture = await tx.fixture.create({
        data: {
          division_id: dto.divisionId,
          match_week_id: dto.matchWeekId,
          home_club_id: dto.homeClubId,
          away_club_id: dto.awayClubId,
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
          { match_id: match.id, club_id: dto.homeClubId, role: 'HOME' },
          { match_id: match.id, club_id: dto.awayClubId, role: 'AWAY' },
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
    const match = await this.prisma.match.findUnique({
      where: { id: dto.matchId },
      include: { fixture: true, result: true },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (match.status === 'ARCHIVED' || match.status === 'VOID') {
      throw new BadRequestException('Cannot submit results for archived or void matches');
    }

    if (match.result) {
      throw new BadRequestException('Result has already been submitted for this match');
    }

    const homeScore = dto.homeScore;
    const awayScore = dto.awayScore;
    const winnerClubId = homeScore > awayScore ? match.fixture.home_club_id : awayScore > homeScore ? match.fixture.away_club_id : null;

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdResult = await tx.matchResult.create({
        data: {
          match_id: match.id,
          home_score: homeScore,
          away_score: awayScore,
          winner_club_id: winnerClubId,
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
        metadata: { result: { result: createdResult, match: updatedMatch }, submittedBy: dto.submittedById },
      });

      return { result: createdResult, match: updatedMatch };
    });

    return result;
  }

  async confirmMatchResult(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { result: true },
    });

    if (!match || !match.result) {
      throw new NotFoundException('Match result not found');
    }

    const resultPayload = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const confirmedResult = await tx.matchResult.update({
        where: { match_id: match.id },
        data: { confirmed_at: new Date() },
      });

      const updatedMatch = await tx.match.update({
        where: { id: match.id },
        data: { status: 'CONFIRMED', ended_at: new Date() },
      });

      await this.outboxService.enqueueEvent(tx, {
        eventName: 'match.result.confirmed',
        aggregateType: 'Match',
        aggregateId: match.id,
        metadata: { match: updatedMatch, result: confirmedResult },
      });

      return { match: updatedMatch, result: confirmedResult };
    });

    return resultPayload;
  }
}
