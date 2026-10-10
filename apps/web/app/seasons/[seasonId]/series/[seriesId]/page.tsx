import { requirePermission } from '../../../../lib/auth-guard';
import { apiServerFetch } from '../../../../lib/api-server-client';
import type { SeriesExecutionWorkspace } from '../../../../lib/api-client';
import SeriesExecutionWorkspacePage from './execution-workspace';

export default async function SeriesExecutionPage({ params }: { params: { seasonId: string; seriesId: string } }) {
  await requirePermission('MANAGE_MATCHES', '/');

  let workspace: SeriesExecutionWorkspace;
  try {
    workspace = await apiServerFetch<SeriesExecutionWorkspace>(`/competition/series/${params.seriesId}/execution`);
  } catch (error) {
    console.error(`Failed to load execution workspace for Series ${params.seriesId}:`, error);
    return <SeriesExecutionWorkspacePage
      seasonId={params.seasonId}
      seriesId={params.seriesId}
      initialWorkspace={null}
      loadError={error instanceof Error ? error.message : 'Unable to load Series execution data.'}
    />;
  }

  return <SeriesExecutionWorkspacePage
    seasonId={params.seasonId}
    seriesId={params.seriesId}
    initialWorkspace={workspace}
  />;
}
