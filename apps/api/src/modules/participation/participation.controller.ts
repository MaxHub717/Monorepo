import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { AuthGuard, AccountStatusGuard } from '../../common/authz/authz.guards.js';
import { ParticipationService } from './participation.service.js';

export class RegisterParticipantDto {
  @IsUUID('4')
  playerId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seed?: number;
}

@Controller('seasons/:seasonId/divisions/:divisionId/participants')
@UseGuards(AuthGuard, AccountStatusGuard)
export class ParticipationController {
  constructor(private readonly participationService: ParticipationService) {}

  @Get()
  list(@Param('seasonId') seasonId: string, @Param('divisionId') divisionId: string) {
    return this.participationService.listParticipants(seasonId, divisionId);
  }

  @Post()
  register(
    @Param('seasonId') seasonId: string,
    @Param('divisionId') divisionId: string,
    @Body() dto: RegisterParticipantDto,
    @Req() req: any,
  ) {
    return this.participationService.register(seasonId, divisionId, dto, {
      id: req.user?.id,
      role: req.user?.roles?.[0],
      correlationId: req.id,
    });
  }
}

@Controller('seasons/:seasonId/participants')
@UseGuards(AuthGuard, AccountStatusGuard)
export class ParticipationWithdrawalController {
  constructor(private readonly participationService: ParticipationService) {}

  @Delete(':playerId')
  withdraw(@Param('seasonId') seasonId: string, @Param('playerId') playerId: string, @Req() req: any) {
    return this.participationService.withdraw(seasonId, playerId, {
      id: req.user?.id,
      role: req.user?.roles?.[0],
      correlationId: req.id,
    });
  }
}
