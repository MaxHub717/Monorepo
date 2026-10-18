'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../components/page-shell';
import { listPublicSeasons, PublicSeason } from '../lib/api-client';
import styles from '../components/layout.module.css';

function formatDate(value: string | null) {
  if (!value) return 'Dates to be announced';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
}

export default function CompetitionsContent() {
  const [seasons, setSeasons] = useState<PublicSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadSeasons() {
    setLoading(true);
    setError(null);
    try {
      setSeasons(await listPublicSeasons());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load public competitions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSeasons();
  }, []);

  return (
    <PageShell title="Competitions" subtitle="Explore publicly available NexGen League seasons.">
      <p className={styles.discoveryFooter}>Looking for a league? <Link href="/leagues">Browse public leagues</Link></p>
      {loading ? <p role="status">Loading public competitions...</p> : null}
      {error ? (
        <div className={styles.publicState} role="alert">
          <p>{error}</p>
          <button className={styles.secondaryButton} onClick={() => void loadSeasons()} type="button">Try again</button>
        </div>
      ) : null}
      {!loading && !error && seasons.length === 0 ? (
        <div className={styles.publicState}>
          <h2>No public seasons yet</h2>
          <p>New competitions will appear here when they are published.</p>
        </div>
      ) : null}
      {!error && seasons.length > 0 ? (
        <div className={styles.competitionList}>
          {seasons.map((season) => (
            <article className={styles.competitionItem} key={season.id}>
              <div>
                <p className={styles.competitionLeague}><Link href={`/leagues/${season.league.id}`}>{season.league.name}</Link></p>
                <h2><Link href={`/competitions/${season.id}`}>{season.name}</Link></h2>
                {season.description ? <p>{season.description}</p> : null}
              </div>
              <div className={styles.competitionMeta}>
                <span>{season.status.replaceAll('_', ' ')}</span>
                <span>{formatDate(season.startDate)} - {formatDate(season.endDate)}</span>
                <span>{season.timezone}</span>
                <span>{season.divisions.length} {season.divisions.length === 1 ? 'division' : 'divisions'}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <p className={styles.discoveryFooter}>Ready to compete? <Link href="/auth/register?returnTo=%2Fplayer%2Fdashboard">Create your League Identity</Link></p>
    </PageShell>
  );
}