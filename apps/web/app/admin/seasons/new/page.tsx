import { requirePermission } from '../../../lib/auth-guard';
import { apiServerFetch } from '../../../lib/api-server-client';
import type { CompetitionRulesetSummary, LeagueSummary } from '../../../lib/api-client';
import CreateSeasonContent from './create-season-content';

export default async function CreateSeasonPage({ searchParams }: { searchParams: { leagueId?: string } }) {
  await requirePermission('MANAGE_SEASONS');
  const [leagues, rulesets] = await Promise.all([
    apiServerFetch<LeagueSummary[]>('/admin/leagues'),
    apiServerFetch<CompetitionRulesetSummary[]>('/competition/rulesets?publishedOnly=true'),
  ]);
  return <CreateSeasonContent leagues={leagues.filter((league) => league.status === 'ACTIVE')} rulesets={rulesets} initialLeagueId={searchParams.leagueId} />;
}
