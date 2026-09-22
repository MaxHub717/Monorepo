'use client';

import Link from 'next/link';
import { useState } from 'react';
import PageShell from '../../components/page-shell';
import { archiveSeason, closeSeasonRegistration, completeSeason, getSeasonOverview, lockSeasonRoster, publishSeason, SeasonOverview, startSeasonPlayoffs, activateSeason } from '../../lib/api-client';
import styles from './season-workspace.module.css';

type Props = { initialOverview: SeasonOverview };

const statusOrder = ['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ROSTER_LOCKED', 'ACTIVE', 'PLAYOFFS', 'COMPLETED', 'ARCHIVED'];

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value)) : 'Not set';
}

function statusLabel(value: string) {
  return value.replaceAll('_', ' ');
}

export default function SeasonWorkspace({ initialOverview }: Props) {
  const [overview, setOverview] = useState(initialOverview);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setOverview(await getSeasonOverview(overview.id));
  }

  async function transition() {
    if (!overview.nextAction) return;
    if (['archive', 'start-playoffs', 'complete'].includes(overview.nextAction.endpoint) && !window.confirm(`Confirm: ${overview.nextAction.label}?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const action = overview.nextAction.endpoint;
      if (action === 'publish') await publishSeason(overview.id);
      if (action === 'close-registration') await closeSeasonRegistration(overview.id);
      if (action === 'lock-roster') await lockSeasonRoster(overview.id);
      if (action === 'activate') await activateSeason(overview.id);
      if (action === 'start-playoffs') await startSeasonPlayoffs(overview.id);
      if (action === 'complete') await completeSeason(overview.id);
      if (action === 'archive') await archiveSeason(overview.id);
      await refresh();
      setMessage(`${overview.nextAction.label} completed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to complete lifecycle action');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title={overview.name} subtitle="Season management workspace.">
      <div className={styles.page}>
        <header className={styles.header}>
          <div><Link className={styles.backLink} href={overview.league ? `/admin/leagues/${overview.league.id}` : '/seasons'}>{overview.league?.name ?? 'Back to seasons'}</Link><p className={styles.eyebrow}>Season workspace</p><h2>{overview.name}</h2><p>{overview.description || 'No season description provided.'}</p></div>
          <span className={styles.statusBadge}>{statusLabel(overview.status)}</span>
        </header>

        <section className={styles.lifecycle} aria-label="Season lifecycle">
          {statusOrder.map((status, index) => <div className={`${styles.lifecycleStep} ${status === overview.status ? styles.current : ''} ${index < statusOrder.indexOf(overview.status) ? styles.complete : ''}`} key={status}><span>{index + 1}</span><small>{statusLabel(status)}</small></div>)}
        </section>

        <section className={styles.actionPanel}>
          <div><p className={styles.eyebrow}>Primary next action</p><h3>{overview.nextAction?.label ?? 'Season archived'}</h3><p>{overview.nextAction?.reason ?? 'This season is historical and no normal lifecycle actions remain.'}</p></div>
          {overview.nextAction && <button className={styles.primaryButton} disabled={busy} onClick={transition}>{busy ? 'Updating...' : overview.nextAction.label}</button>}
        </section>
        {message && <p className={styles.message}>{message}</p>}

        <section className={styles.metricGrid} aria-label="Season summary">
          {Object.entries({ Participants: overview.counts.participants, Divisions: overview.counts.divisions, Fixtures: overview.counts.fixtures, Matches: overview.counts.matches, 'Pending results': overview.counts.pendingResults, Disputes: overview.counts.disputes, Penalties: overview.counts.penalties }).map(([label, value]) => <div className={styles.metric} key={label}><strong>{value}</strong><span>{label}</span></div>)}
        </section>

        <section className={styles.detailsGrid}>
          <div className={styles.panel}><p className={styles.eyebrow}>Season details</p><h3>Competition window</h3><dl><div><dt>League</dt><dd>{overview.league?.name ?? 'Not assigned'}</dd></div><div><dt>Start</dt><dd>{formatDate(overview.start_date)}</dd></div><div><dt>End</dt><dd>{formatDate(overview.end_date)}</dd></div><div><dt>Registration opened</dt><dd>{formatDate(overview.registration_open_at)}</dd></div><div><dt>Registration closed</dt><dd>{formatDate(overview.registration_close_at)}</dd></div></dl></div>
          <div className={styles.panel}><p className={styles.eyebrow}>Configuration</p><h3>Divisions</h3>{overview.divisions.length ? <div className={styles.divisionList}>{overview.divisions.map((division) => <div className={styles.division} key={division.id}><div><strong>{division.name}</strong><span>{statusLabel(division.type)} · {statusLabel(division.format)}</span></div><span>{division._count.participants}/{division.capacity ?? '∞'} players</span></div>)}</div> : <p>No divisions configured.</p>}</div>
        </section>

        <nav className={styles.workspaces} aria-label="Season workspaces"><Link href={`/participants?seasonId=${overview.id}`}>Participants</Link><Link href={`/fixtures?seasonId=${overview.id}`}>Fixtures</Link><Link href={`/results?seasonId=${overview.id}`}>Results</Link><Link href={`/standings?seasonId=${overview.id}`}>Standings</Link><Link href={`/disputes?seasonId=${overview.id}`}>Disputes</Link><Link href={`/penalties?seasonId=${overview.id}`}>Penalties</Link></nav>
      </div>
    </PageShell>
  );
}
