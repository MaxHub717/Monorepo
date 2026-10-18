'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../components/page-shell';
import { listPublicLeagues, PublicLeague } from '../lib/api-client';
import styles from '../components/layout.module.css';

export default function LeaguesContent() {
  const [leagues, setLeagues] = useState<PublicLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadLeagues() {
    setLoading(true);
    setError(null);
    try {
      setLeagues(await listPublicLeagues());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load public leagues.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLeagues();
  }, []);

  return (
    <PageShell title="Leagues" subtitle="Discover active NexGen League organizations and their published seasons.">
      {loading ? <p role="status">Loading public leagues...</p> : null}
      {error ? (
        <div className={styles.publicState} role="alert">
          <p>{error}</p>
          <button className={styles.secondaryButton} onClick={() => void loadLeagues()} type="button">Try again</button>
        </div>
      ) : null}
      {!loading && !error && leagues.length === 0 ? (
        <div className={styles.publicState}>
          <h2>No public leagues yet</h2>
          <p>Active leagues will appear here when they have been published.</p>
          <Link href="/competitions">Browse seasons</Link>
        </div>
      ) : null}
      {!error && leagues.length > 0 ? (
        <div className={styles.competitionList}>
          {leagues.map((league) => (
            <article className={styles.competitionItem} key={league.id}>
              <p className={styles.competitionLeague}>{league.region || 'NexGen League'}</p>
              <h2><Link href={`/leagues/${league.id}`}>{league.name}</Link></h2>
              {league.description ? <p>{league.description}</p> : null}
              <div className={styles.competitionMeta}>
                <span>{league.seasons.length} {league.seasons.length === 1 ? 'public season' : 'public seasons'}</span>
                <Link href={`/leagues/${league.id}`}>View league</Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <p className={styles.discoveryFooter}><Link href="/competitions">Browse all seasons</Link></p>
    </PageShell>
  );
}