import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export type FixtureGenerationState =
  | 'BLOCKED'
  | 'NOT_GENERATED'
  | 'GENERATED'
  | 'INCOMPLETE';

export interface FixtureScheduleValidationDto {
  valid: boolean;
  totalFixtures: number;
  fixturesPerParticipant: Array<{ participantId: string; fixtureCount: number }>;
  fixturesPerSchedulingPeriod: Array<{ periodNumber: number; fixtureCount: number }>;
  maximumFixturesPerParticipantPerPeriod: number;
  requiredConcurrentMatches: number;
  configuredConcurrentMatches: number;
  schedulingPeriodsRequired: number;
  errors: string[];
  densityWarnings: string[];
}

export interface DivisionFixtureStatusDto {
  divisionId: string;
  divisionName: string;
  active: boolean;
  format: string;
  registrationCapacity: number | null;
  competitionCapacity: number | null;
  configuredCompetitionParticipantCount: number | null;
  schedulingPeriodDays: number;
  matchesPerParticipant: number;
  matchWindowStartMinutes: number | null;
  matchWindowEndMinutes: number | null;
  matchWindowTimezone: string;
  concurrentMatches: number;
  registrationCount: number;
  participantCount: number;
  expectedFixtureCount: number;
  currentFixtureCount: number;
  scheduledFixtureCount: number;
  unscheduledFixtureCount: number;
  roundCount: number;
  schedulingPeriodCount: number;
  currentRound: number | null;
  conflictCount: number | null;
  scheduleLocked: boolean;
  generationStatus: FixtureGenerationState;
  validation: FixtureScheduleValidationDto | null;
  blockers: string[];
  warnings: string[];
}

export interface SeasonFixtureStatusDto {
  seasonId: string;
  seasonName: string;
  leagueName: string;
  seasonStatus: string;
  divisions: DivisionFixtureStatusDto[];
}

export class FixturePageQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class ScheduleFixtureDto {
  @IsDateString()
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, { message: 'scheduledAt must include an explicit timezone offset' })
  scheduledAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  timezone!: string;

  @IsDateString()
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, { message: 'checkInOpensAt must include an explicit timezone offset' })
  checkInOpensAt!: string;

  @IsDateString()
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, { message: 'checkInClosesAt must include an explicit timezone offset' })
  checkInClosesAt!: string;

  @IsDateString()
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, { message: 'playWindowOpensAt must include an explicit timezone offset' })
  playWindowOpensAt!: string;

  @IsDateString()
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, { message: 'playWindowClosesAt must include an explicit timezone offset' })
  playWindowClosesAt!: string;
}

export interface FixtureWorkspaceRowDto {
  id: string;
  fixtureNumber: number | null;
  scheduledAt: string | null;
  timezone: string | null;
  checkInOpensAt: string | null;
  checkInClosesAt: string | null;
  playWindowOpensAt: string | null;
  playWindowClosesAt: string | null;
  schedulingStatus: string;
  status: string;
  roundNumber: number | null;
  schedulingPeriodNumber: number | null;
  homePlayer: { id: string; gamerTag: string };
  awayPlayer: { id: string; gamerTag: string };
  matchStatus: string | null;
}

export interface FixturePageDto {
  divisionId: string;
  scheduleLocked: boolean;
  fixtures: FixtureWorkspaceRowDto[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}