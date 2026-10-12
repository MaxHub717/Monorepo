import { notFound } from 'next/navigation';
import { requirePermission } from '../../../../lib/auth-guard';
import { apiServerFetch } from '../../../../lib/api-server-client';
import type { CompetitionRulesDocument, SeasonOverview, SeasonRulesWorkspace } from '../../../../lib/api-client';
import SeasonRulesAdmin from '../../../rulesets/season-rules-admin';

export default async function SeasonRulesPage({ params }: { params: { seasonId: string } }) {
  await requirePermission('MANAGE_SEASONS');
  const { seasonId } = params;
  try {
    const [season, defaultRules, initialRules] = await Promise.all([
      apiServerFetch<SeasonOverview>(`/seasons/${seasonId}/overview`),
      apiServerFetch<CompetitionRulesDocument>('/competition/rulesets/defaults'),
      apiServerFetch<SeasonRulesWorkspace>(`/seasons/${seasonId}/rules`),
    ]);
    return <SeasonRulesAdmin seasonId={seasonId} seasonName={season.name} defaultRules={defaultRules} initialRules={initialRules} />;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Season not found')) notFound();
    throw error;
  }
}
