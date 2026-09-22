import { notFound } from 'next/navigation';
import { requirePermission } from '../../../lib/auth-guard';
import { apiServerFetch } from '../../../lib/api-server-client';
import LeagueWorkspace from './league-workspace';

type LeagueWorkspaceData = Parameters<typeof LeagueWorkspace>[0]['league'];

export default async function LeaguePage({ params }: { params: { leagueId: string } }) {
  await requirePermission('VIEW_ADMIN_DASHBOARD');
  try {
    const league = await apiServerFetch<LeagueWorkspaceData>(`/admin/leagues/${params.leagueId}`);
    return <LeagueWorkspace league={league} />;
  } catch {
    notFound();
  }
}
