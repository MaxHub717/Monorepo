import { notFound } from 'next/navigation';
import { requirePermission } from '../../lib/auth-guard';
import { apiServerFetch } from '../../lib/api-server-client';
import type { SeasonFixtureSchedule, SeasonOverview } from '../../lib/api-client';
import SeasonWorkspace from './season-workspace';

export default async function SeasonWorkspacePage({ params }: { params: { seasonId: string } }) {
  await requirePermission('MANAGE_SEASONS', '/');
  try {
    const [overview, schedule] = await Promise.all([
      apiServerFetch<SeasonOverview>(`/seasons/${params.seasonId}/overview`),
      apiServerFetch<SeasonFixtureSchedule>(`/fixtures/seasons/${params.seasonId}`),
    ]);
    return <SeasonWorkspace initialOverview={overview} initialSchedule={schedule} />;
  } catch {
    notFound();
  }
}
