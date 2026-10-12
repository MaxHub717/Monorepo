import { requirePermission } from '../../../lib/auth-guard';
import { apiServerFetch } from '../../../lib/api-server-client';
import type { LeagueSummary } from '../../../lib/api-client';
import CreateSeasonContent from './create-season-content';

export default async function CreateSeasonPage({ searchParams }: { searchParams: { leagueId?: string } }) {
  await requirePermission('MANAGE_SEASONS');
  const leagues = await apiServerFetch<LeagueSummary[]>('/admin/leagues');
  return <CreateSeasonContent leagues={leagues.filter((league) => league.status === 'ACTIVE')} initialLeagueId={searchParams.leagueId} />;
}
