export type FixtureGenerationState =
  | 'BLOCKED'
  | 'NOT_GENERATED'
  | 'GENERATED'
  | 'INCOMPLETE';

export interface DivisionFixtureStatusDto {
  divisionId: string;
  divisionName: string;
  active: boolean;
  format: string;
  participantCount: number;
  expectedFixtureCount: number;
  currentFixtureCount: number;
  roundCount: number;
  generationStatus: FixtureGenerationState;
  blockers: string[];
  warnings: string[];
}

export interface SeasonFixtureStatusDto {
  seasonId: string;
  seasonStatus: string;
  divisions: DivisionFixtureStatusDto[];
}