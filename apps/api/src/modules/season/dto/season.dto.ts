import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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
  @IsIn(['ROUND_ROBIN_SINGLE', 'ROUND_ROBIN_DOUBLE'])
  divisionFormat?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  divisionCapacity?: number;
}

export class CreateDivisionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  capacity?: number;

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
  @IsString()
  format?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
