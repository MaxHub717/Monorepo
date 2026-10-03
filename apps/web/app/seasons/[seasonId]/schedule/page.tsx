import { notFound } from 'next/navigation';
import { requirePermission } from '../../../lib/auth-guard';
import { apiServerFetch } from '../../../lib/api-server-client';
import type { DivisionFixturePage, SeasonFixtureSchedule } from '../../../lib/api-client';
import ScheduleWorkspace from './schedule-workspace';

export default async function SeasonSchedulePage({ params }: { params: { seasonId: string } }) {
  await requirePermission('MANAGE_MATCHES', '/');

  try {
    const schedule = await apiServerFetch<SeasonFixtureSchedule>(`/fixtures/seasons/${params.seasonId}`);
    const firstDivision = schedule.divisions[0];
    const initialFixtures = firstDivision
      ? await apiServerFetch<DivisionFixturePage>(
          `/fixtures/seasons/${params.seasonId}/divisions/${firstDivision.divisionId}?page=1&limit=25`,
        )
      : null;

    return (
      <ScheduleWorkspace
        seasonId={params.seasonId}
        initialSchedule={schedule}
        initialFixtures={initialFixtures}
      />
    );
  } catch (error) {
    console.error(
      `Failed to load schedule workspace for season ${params.seasonId}:`,
      error,
    );

    notFound();
  }
}