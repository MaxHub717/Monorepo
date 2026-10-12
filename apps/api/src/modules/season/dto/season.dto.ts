import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

const competitionFormats = ['ROUND_ROBIN_SINGLE', 'ROUND_ROBIN_DOUBLE'];

export class CreateSeasonDto {
  @IsUUID('4')
  leagueId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  divisionName?: string;

  @IsOptional()
  @IsIn(['AMATEUR', 'COMPETITIVE', 'ELITE', 'VERIFIED_PRO'])
  divisionType?: string;

  @IsOptional()
  @IsIn(competitionFormats)
  divisionFormat?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  divisionCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  registrationCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  competitionParticipantCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  schedulingPeriodDays?: number;

  /** Soft target per scheduling period; the complete fixture set is always retained. */
  @IsOptional()
  @IsInt()
  @Min(1)
  matchesPerParticipant?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  matchWindowStartMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  matchWindowEndMinutes?: number;

  @IsOptional()
  @IsString()
  matchWindowTimezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  concurrentMatches?: number;
}

export class CreateDivisionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(competitionFormats)
  format?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  registrationCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  competitionParticipantCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  schedulingPeriodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  matchesPerParticipant?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  matchWindowStartMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  matchWindowEndMinutes?: number;

  @IsOptional()
  @IsString()
  matchWindowTimezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  concurrentMatches?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateDivisionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(competitionFormats)
  format?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  registrationCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  competitionParticipantCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  schedulingPeriodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  matchesPerParticipant?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  matchWindowStartMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  matchWindowEndMinutes?: number;

  @IsOptional()
  @IsString()
  matchWindowTimezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  concurrentMatches?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
