'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../components/page-shell';
import { listPublicPlayers, PublicPlayerSummary } from '../lib/api-client';
import styles from '../components/layout.module.css';

export default function CareerContent() {
  const [players, setPlayers] = useState<PublicPlayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPlayers() {
    setLoading(true);
    setError(null);
    try {
      setPlayers(await listPublicPlayers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load public player profiles.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadPlayers(); }, []);

  return (
    <PageShell title="Career" subtitle="Explore competitors and their published competition history.">
      {loading ? <p role="status">Loading public players...</p> : null}
      {error ? (
        <div className={styles.publicState} role="alert">
          <p>{error}</p>
          <button className={styles.secondaryButton} onClick={() => void loadPlayers()} type="button">Try again</button>
        </div>
      ) : null}
      {!loading && !error && players.length === 0 ? (
        <div className={styles.publicState}>
          <h2>No public player profiles yet</h2>
          <p>Players who choose public discovery will appear here.</p>
          <Link href="/competitions">Explore competitions</Link>
        </div>
      ) : null}
      {!error && players.length > 0 ? (
        <div className={styles.competitionList}>
          {players.map((player) => (
            <article className={styles.competitionItem} key={player.id}>
              <h2><Link href={`/players/${player.id}`}>{player.gamerTag}</Link></h2>
              {player.region ? <p>{player.region}</p> : null}
              <Link href={`/players/${player.id}`}>View public career</Link>
            </article>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}