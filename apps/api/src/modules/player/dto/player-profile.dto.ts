import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdatePlayerProfileDto {
  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  gamerTag?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  publicProfile?: boolean;
}
