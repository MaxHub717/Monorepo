import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AdminRegisterParticipantDto {
  @IsUUID('4')
  playerId!: string;

  @IsUUID('4')
  divisionId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seed?: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class AdminUpdateParticipantDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'WITHDRAWN', 'DISQUALIFIED'])
  status?: string;

  @IsOptional()
  @IsUUID('4')
  divisionId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seed?: number | null;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class AdminBulkRegisterParticipantDto {
  @IsArray()
  participants!: Array<AdminRegisterParticipantDto>;
}

export class AdminBulkUpdateParticipantDto {
  @IsArray()
  participants!: Array<AdminUpdateParticipantDto & { participantId: string }>;
}