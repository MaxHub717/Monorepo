import { BadRequestException } from '@nestjs/common';
import { CompetitionFormat } from '@prisma/client';

// One fixture currently incurs three awaited writes; 10,000 fixtures already means roughly 30,000 writes in one serializable transaction.
// Larger schedules need a staged/batched writer rather than this synchronous request path.
export const MAX_FIXTURES_PER_GENERATION = 10_000;

export interface CompetitionParticipantCandidate {
  player_id: string;
  seed: number | null;
  registered_at: Date;
}

export interface CompetitionFieldConfiguration {
  competition_participant_count: number | null;
  capacity: number | null;
}

export function resolveCompetitionParticipantCount(
  division: CompetitionFieldConfiguration,
  eligibleParticipantCount: number,
) {
  return division.competition_participant_count ?? division.capacity ?? eligibleParticipantCount;
}

export function selectCompetitionParticipants<T extends CompetitionParticipantCandidate>(
  participants: T[],
  competitionParticipantCount: number,
) {
  return [...participants].sort(compareCompetitionParticipants).slice(0, competitionParticipantCount);
}

export function compareCompetitionParticipants(
  a: CompetitionParticipantCandidate,
  b: CompetitionParticipantCandidate,
) {
  if (a.seed !== null && b.seed !== null && a.seed !== b.seed) return a.seed - b.seed;
  if (a.seed !== null && b.seed === null) return -1;
  if (a.seed === null && b.seed !== null) return 1;
  const registered = a.registered_at.getTime() - b.registered_at.getTime();
  return registered || a.player_id.localeCompare(b.player_id);
}

export function expectedRoundRobinFixtureCount(participantCount: number, format: CompetitionFormat) {
  let fixturesPerPair: number;
  switch (format) {
    case CompetitionFormat.ROUND_ROBIN_SINGLE:
      fixturesPerPair = 1;
      break;
    case CompetitionFormat.ROUND_ROBIN_DOUBLE:
      fixturesPerPair = 2;
      break;
    default:
      throw new BadRequestException(`Unsupported competition format: ${String(format)}`);
  }

  return participantCount * (participantCount - 1) / 2 * fixturesPerPair;
}

export function expectedRoundRobinRoundCount(participantCount: number, format: CompetitionFormat) {
  if (participantCount < 2) return 0;
  const singleLegRounds = participantCount % 2 === 0 ? participantCount - 1 : participantCount;

  switch (format) {
    case CompetitionFormat.ROUND_ROBIN_SINGLE:
      return singleLegRounds;
    case CompetitionFormat.ROUND_ROBIN_DOUBLE:
      return singleLegRounds * 2;
    default:
      throw new BadRequestException(`Unsupported competition format: ${String(format)}`);
  }
}