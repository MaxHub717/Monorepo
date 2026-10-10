import { requirePermission } from '../../lib/auth-guard';
import { apiServerFetch } from '../../lib/api-server-client';
import type { CompetitionRulesDocument, CompetitionRulesetSummary } from '../../lib/api-client';
import RulesetAdmin from './ruleset-admin';

export default async function CompetitionRulesetsPage() {
  await requirePermission('MANAGE_SEASONS');
  const [rulesets, defaults] = await Promise.all([
    apiServerFetch<CompetitionRulesetSummary[]>('/competition/rulesets'),
    apiServerFetch<CompetitionRulesDocument>('/competition/rulesets/defaults'),
  ]);
  return <RulesetAdmin initialRulesets={rulesets} defaultRules={defaults} />;
}
