import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export const leagueStatuses = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

export class CreateLeagueDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateLeagueDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  region?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @IsOptional()
  @IsIn(leagueStatuses)
  status?: string;
}

export class AssignLeagueOperatorDto {
  @IsUUID('4')
  userId!: string;

  @IsOptional()
  @IsString()
  region?: string | null;

  @IsOptional()
  @IsUUID('4')
  assignedDivisionId?: string | null;
}