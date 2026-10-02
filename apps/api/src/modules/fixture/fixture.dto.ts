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
  roundCount: number;
  schedulingPeriodCount: number;
  generationStatus: FixtureGenerationState;
  validation: FixtureScheduleValidationDto | null;
  blockers: string[];
  warnings: string[];
}

export interface SeasonFixtureStatusDto {
  seasonId: string;
  seasonStatus: string;
  divisions: DivisionFixtureStatusDto[];
}