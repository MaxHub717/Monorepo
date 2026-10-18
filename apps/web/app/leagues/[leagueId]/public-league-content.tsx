'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../components/page-shell';
import { getPublicLeague, PublicLeague } from '../../lib/api-client';
import styles from '../../components/layout.module.css';

function formatDate(value: string | null) {
  if (!value) return 'Dates to be announced';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
}

export default function PublicLeagueContent({ leagueId }: { leagueId: string }) {
  const [league, setLeague] = useState<PublicLeague | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadLeague() {
    setLoading(true);
    setError(null);
    try {
      setLeague(await getPublicLeague(leagueId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this public league.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLeague();
  }, [leagueId]);

  return (
    <PageShell title={league?.name ?? 'League'} subtitle="Public league overview and visible seasons.">
      <p className={styles.discoveryFooter}><Link href="/leagues">All leagues</Link></p>
      {loading ? <p role="status">Loading league...</p> : null}
      {error ? (
        <div className={styles.publicState} role="alert">
          <p>{error}</p>
          <button className={styles.secondaryButton} onClick={() => void loadLeague()} type="button">Try again</button>
        </div>
      ) : null}
      {league && !loading && !error ? (
        <>
          <section className={styles.publicState}>
            {league.region ? <p className={styles.competitionLeague}>{league.region}</p> : null}
            <h2>{league.name}</h2>
            <p>{league.description || 'No public description is available.'}</p>
          </section>
          <section aria-labelledby="public-seasons-heading">
            <h2 id="public-seasons-heading">Seasons</h2>
            {league.seasons.length === 0 ? (
              <div className={styles.publicState}><p>No public seasons are available for this league yet.</p></div>
            ) : (
              <div className={styles.competitionList}>
                {league.seasons.map((season) => (
                  <article className={styles.competitionItem} key={season.id}>
                    <p className={styles.competitionLeague}>{season.status.replaceAll('_', ' ')}</p>
                    <h3><Link href={`/competitions/${season.id}`}>{season.name}</Link></h3>
                    {season.description ? <p>{season.description}</p> : null}
                    <div className={styles.competitionMeta}>
                      <span>{formatDate(season.startDate)} - {formatDate(season.endDate)}</span>
                      <span>{season.timezone}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </PageShell>
  );
}