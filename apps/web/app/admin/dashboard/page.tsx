import Link from 'next/link';
import PageShell from '../../components/page-shell';
import { requirePermission } from '../../lib/auth-guard';
import { apiServerFetch } from '../../lib/api-server-client';
import styles from './dashboard.module.css';

type DashboardOverview = {
  metrics: Record<'activeSeasons' | 'registrationOpen' | 'participants' | 'fixtures' | 'pendingResults' | 'activeMatches' | 'openDisputes' | 'pendingPenalties', number>;
  activeSeasons: Array<{ id: string; name: string; status: string; startDate: string | null; endDate: string | null; participantCount: number; matchCount: number; divisionCount: number }>;
  alerts: Array<{ type: string; title: string; count: number; href: string }>;
  recentActivity: Array<{ id: string; entity_type: string; entity_id: string; action: string; actor_role: string | null; created_at: string }>;
};

const metricCards = [
  ['activeSeasons', 'Active seasons', 'Running or preparing'],
  ['registrationOpen', 'Open registration', 'Accepting participants'],
  ['participants', 'Active participants', 'Across all divisions'],
  ['activeMatches', 'Live matches', 'Currently in operation'],
  ['pendingResults', 'Pending results', 'Awaiting verification'],
  ['openDisputes', 'Open disputes', 'Need review'],
  ['pendingPenalties', 'Pending penalties', 'Need a decision'],
  ['fixtures', 'Fixtures', 'Generated in the system'],
] as const;

function formatDate(value: string | null) {
  if (!value) return 'Date not set';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

function labelStatus(status: string) {
  return status.replaceAll('_', ' ');
}

export default async function AdminDashboardPage() {
  const user = await requirePermission('VIEW_ADMIN_DASHBOARD');
  const overview = await apiServerFetch<DashboardOverview>('/admin/dashboard');

  return (
    <PageShell title="Admin Dashboard" subtitle="Platform administration and league operations.">
      <div className={styles.dashboardContainer}>
          <section className={styles.welcomeCard}>
            <p className={styles.eyebrow}>Operations centre</p>
            <h2>Good to see you, {user.email}</h2>
            <p className={styles.subtitle}>The latest competition signals and actions are collected here.</p>
            <Link href="/admin/leagues" className={styles.primaryAction}>Open leagues</Link>
          </section>

          <section className={styles.metricGrid} aria-label="Operational metrics">
            {metricCards.map(([key, title, detail]) => (
              <div className={styles.metricCard} key={key}>
                <span className={styles.metricLabel}>{title}</span>
                <strong className={styles.metricValue}>{overview.metrics[key]}</strong>
                <span className={styles.metricDetail}>{detail}</span>
              </div>
            ))}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>Attention queue</p><h3 className={styles.sectionTitle}>What needs action</h3></div>
              <span className={overview.alerts.length ? styles.queueStatus : styles.queueStatusQuiet}>{overview.alerts.length ? `${overview.alerts.length} items` : 'All clear'}</span>
            </div>
            {overview.alerts.length ? (
              <div className={styles.alertList}>
                {overview.alerts.map((alert) => (
                  <Link href={alert.href} className={styles.alert} key={alert.type}>
                    <span className={styles.alertMarker} />
                    <span><strong>{alert.title}</strong><small>Open the relevant workspace</small></span>
                    <b>{alert.count}</b>
                  </Link>
                ))}
              </div>
            ) : <div className={styles.emptyState}>No operational issues are waiting for review.</div>}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>Competition pulse</p><h3 className={styles.sectionTitle}>Active seasons</h3></div>
              <Link href="/seasons" className={styles.textLink}>View all seasons</Link>
            </div>
            {overview.activeSeasons.length ? (
              <div className={styles.seasonList}>
                {overview.activeSeasons.map((season) => (
                  <article className={styles.seasonRow} key={season.id}>
                    <div className={styles.seasonIdentity}><span className={styles.statusDot} /><div><h4>{season.name}</h4><span>{formatDate(season.startDate)} - {formatDate(season.endDate)}</span></div></div>
                    <span className={styles.statusBadge}>{labelStatus(season.status)}</span>
                    <span className={styles.seasonStat}><b>{season.participantCount}</b> participants</span>
                    <span className={styles.seasonStat}><b>{season.matchCount}</b> matches</span>
                    <span className={styles.seasonStat}><b>{season.divisionCount}</b> divisions</span>
                  </article>
                ))}
              </div>
            ) : <div className={styles.emptyState}>No active seasons are currently configured.</div>}
          </section>

          <div className={styles.twoColumn}>
            <section className={styles.section}>
              <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Governance</p><h3 className={styles.sectionTitle}>Recent activity</h3></div><Link href="/audit" className={styles.textLink}>Audit log</Link></div>
              {overview.recentActivity.length ? <div className={styles.activityList}>{overview.recentActivity.map((entry) => <div className={styles.activityItem} key={entry.id}><span className={styles.activityTime}>{formatDate(entry.created_at)}</span><span><strong>{entry.action.replaceAll('_', ' ')}</strong><small>{entry.entity_type} {entry.entity_id.slice(0, 8)} · {entry.actor_role ?? 'System'}</small></span></div>)}</div> : <div className={styles.emptyState}>No audit activity yet.</div>}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Shortcuts</p><h3 className={styles.sectionTitle}>Quick actions</h3></div></div>
              <div className={styles.actionList}>
                <Link href="/admin/leagues" className={styles.actionLink}>Manage leagues <span>↗</span></Link>
                <Link href="/admin/seasons/new" className={styles.actionLink}>Create season <span>↗</span></Link>
                <Link href="/admin/rulesets" className={styles.actionLink}>Competition rulesets <span>↗</span></Link>
                <Link href="/seasons" className={styles.actionLink}>Manage seasons <span>↗</span></Link>
                <Link href="/results" className={styles.actionLink}>Review results <span>↗</span></Link>
                <Link href="/disputes" className={styles.actionLink}>Review disputes <span>↗</span></Link>
                <Link href="/penalties" className={styles.actionLink}>Manage penalties <span>↗</span></Link>
              </div>
            </section>
          </div>

          <section className={styles.section}>
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Platform administration</p><h3 className={styles.sectionTitle}>Access and governance</h3></div></div>
            <div className={styles.adminLinks}>
              <Link href="/admin/rbac" className={styles.adminLink}><strong>Users & RBAC</strong><span>Manage roles and access assignments</span></Link>
              <Link href="/audit" className={styles.adminLink}><strong>Audit logs</strong><span>Review administrative history</span></Link>
              <div className={styles.adminLinkDisabled}><strong>Roles & permissions</strong><span>Available in a future admin workflow</span></div>
            </div>
          </section>
        </div>
    </PageShell>
  );
}



