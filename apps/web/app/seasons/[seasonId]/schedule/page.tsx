import { requirePermission } from '../../../lib/auth-guard';
import { apiServerFetch } from '../../../lib/api-server-client';
import type { CompetitionWorkspace } from '../../../lib/api-client';
import CompetitionWorkspacePage from './competition-workspace';

export default async function SeasonSchedulePage({ params }: { params: { seasonId: string } }) {
  await requirePermission('MANAGE_MATCHES', '/');

  let workspace: CompetitionWorkspace;
  try {
    workspace = await apiServerFetch<CompetitionWorkspace>(`/competition/seasons/${params.seasonId}/workspace`);
  } catch (error) {
    console.error(
      `Failed to load Competition workspace for season ${params.seasonId}:`,
      error,
    );
    return (
      <CompetitionWorkspacePage
        seasonId={params.seasonId}
        initialWorkspace={null}
        loadError={error instanceof Error ? error.message : 'Unable to load Competition data.'}
      />
    );
  }

  return (
    <CompetitionWorkspacePage
      seasonId={params.seasonId}
      initialWorkspace={workspace}
    />
  );
}