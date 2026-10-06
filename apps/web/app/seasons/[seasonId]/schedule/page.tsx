import { requirePermission } from '../../../lib/auth-guard';
import { apiServerFetch } from '../../../lib/api-server-client';
import type { DivisionFixturePage, SeasonFixtureSchedule } from '../../../lib/api-client';
import ScheduleWorkspace from './schedule-workspace';

export default async function SeasonSchedulePage({ params }: { params: { seasonId: string } }) {
  await requirePermission('MANAGE_MATCHES', '/');

  let schedule: SeasonFixtureSchedule;
  try {
    schedule = await apiServerFetch<SeasonFixtureSchedule>(`/fixtures/seasons/${params.seasonId}`);
  } catch (error) {
    console.error(
      `Failed to load schedule workspace for season ${params.seasonId}:`,
      error,
    );
    return (
      <ScheduleWorkspace
        seasonId={params.seasonId}
        initialSchedule={{
          seasonId: params.seasonId,
          seasonName: 'Schedule unavailable',
          leagueName: '',
          seasonStatus: 'UNKNOWN',
          divisions: [],
        }}
        initialFixtures={null}
        initialLoadError={error instanceof Error ? error.message : 'Unable to load schedule data.'}
      />
    );
  }

  const firstDivision = schedule.divisions[0];
  let initialFixtures: DivisionFixturePage | null = null;
  let initialFixturesError: string | undefined;
  if (firstDivision) {
    try {
      initialFixtures = await apiServerFetch<DivisionFixturePage>(
        `/fixtures/seasons/${params.seasonId}/divisions/${firstDivision.divisionId}?page=1&limit=25`,
      );
    } catch (error) {
      console.error(
        `Failed to load fixtures for schedule workspace season ${params.seasonId}:`,
        error,
      );
      initialFixturesError = error instanceof Error ? error.message : 'Unable to load division fixtures.';
    }
  }

  return (
    <ScheduleWorkspace
      seasonId={params.seasonId}
      initialSchedule={schedule}
      initialFixtures={initialFixtures}
      initialFixturesError={initialFixturesError}
    />
  );
}