import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';

export enum ClubMemberRole {
  MANAGER = 'MANAGER',
  COACH = 'COACH',
  PLAYER = 'PLAYER',
  SUPPORT = 'SUPPORT',
}

export class CreateClubDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  tag!: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateClubDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AssignClubStaffDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsEnum(ClubMemberRole)
  role!: ClubMemberRole;
}

export enum ClubMemberStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class ApplyClubApplicationDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateClubMemberStatusDto {
  @IsEnum(ClubMemberStatus)
  status!: ClubMemberStatus;
}
