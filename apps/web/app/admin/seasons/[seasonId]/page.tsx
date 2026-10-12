import Link from 'next/link';
import PageShell from '../../../components/page-shell';
import { requirePermission } from '../../../lib/auth-guard';
import { apiServerFetch } from '../../../lib/api-server-client';
import type { SeasonOverview } from '../../../lib/api-client';
import styles from './season-overview.module.css';

const rulesLabels: Record<SeasonOverview['rulesStatus'], string> = {
  NOT_CONFIGURED: 'Not configured',
  DRAFT: 'Draft / incomplete',
  VALID: 'Valid and ready',
  PUBLISHED: 'Published / finalized',
};

export default async function SeasonOverviewPage({ params }: { params: { seasonId: string } }) {
  await requirePermission('MANAGE_SEASONS');
  const season = await apiServerFetch<SeasonOverview>(`/seasons/${params.seasonId}/overview`);
  const configured = season.rulesStatus === 'VALID' || season.rulesStatus === 'PUBLISHED';
  return (
    <PageShell title={season.name} subtitle={`${season.league.name} · season workspace`}>
      <main className={styles.page}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Season overview</p><h2>{season.name}</h2><p>{season.description || 'No season description.'}</p></div>
          <span className={styles.status}>{season.status.replaceAll('_', ' ')}</span>
        </header>
        <section className={styles.rules} aria-labelledby="season-rules-heading">
          <div><p className={styles.eyebrow}>Season configuration</p><h3 id="season-rules-heading">Season Rules</h3><p>{rulesLabels[season.rulesStatus]}</p></div>
          <Link className={styles.primary} href={`/admin/seasons/${season.id}/rules`}>
            {configured ? 'Edit Season Rules' : 'Season Rules — Configure rules'}
          </Link>
        </section>
        <section className={styles.readiness} aria-labelledby="readiness-heading">
          <div><p className={styles.eyebrow}>Lifecycle readiness</p><h3 id="readiness-heading">{season.readiness.canAdvance ? 'Ready for next step' : 'Configuration required'}</h3></div>
          {season.readiness.issues.length ? <ul>{season.readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p>Current season prerequisites are satisfied.</p>}
          {!configured && <p className={styles.notice}>Registration and activation remain blocked until valid season rules are saved.</p>}
        </section>
        <section className={styles.details} aria-label="Season details">
          <div><span>Start date</span><strong>{season.start_date ? new Date(season.start_date).toLocaleDateString() : 'Not set'}</strong></div>
          <div><span>End date</span><strong>{season.end_date ? new Date(season.end_date).toLocaleDateString() : 'Not set'}</strong></div>
          <div><span>Divisions</span><strong>{season.counts.divisions}</strong></div>
          <div><span>Participants</span><strong>{season.counts.participants}</strong></div>
        </section>
      </main>
    </PageShell>
  );
}
