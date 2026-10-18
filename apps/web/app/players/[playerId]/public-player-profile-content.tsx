'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../components/page-shell';
import { getPublicPlayerProfile, PublicPlayerProfile } from '../../lib/api-client';
import styles from '../../components/layout.module.css';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
}

export default function PublicPlayerProfileContent({ playerId }: { playerId: string }) {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      setProfile(await getPublicPlayerProfile(playerId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this public profile.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProfile(); }, [playerId]);

  return (
    <PageShell title={profile?.player.gamerTag ?? 'Player profile'} subtitle="Public competitive identity and published career history.">
      <p className={styles.discoveryFooter}><Link href="/career">Public player directory</Link></p>
      {loading ? <p role="status">Loading public profile...</p> : null}
      {error ? (
        <div className={styles.publicState} role="alert">
          <p>{error}</p>
          <button className={styles.secondaryButton} onClick={() => void loadProfile()} type="button">Try again</button>
        </div>
      ) : null}
      {profile && !loading && !error ? (
        <>
          <section className={styles.publicState}>
            <h2>{profile.player.gamerTag}</h2>
            {profile.player.region ? <p>{profile.player.region}</p> : null}
          </section>
          <section aria-labelledby="player-career-heading">
            <h2 id="player-career-heading">Published competition history</h2>
            {profile.career.length === 0 ? (
              <div className={styles.publicState}><p>No published competition history is available yet.</p></div>
            ) : (
              <div className={styles.competitionList}>
                {profile.career.map((entry) => (
                  <article className={styles.competitionItem} key={entry.seriesId}>
                    <p className={styles.competitionLeague}>{entry.phase.name} · Series {entry.seriesNumber ?? '—'}</p>
                    <h3><Link href={`/series/${entry.seriesId}`}>{entry.season.name}</Link></h3>
                    <p>{entry.participants.join(' vs ')}</p>
                    <ul>{entry.games.map((game) => game.result ? (
                      <li key={game.number}>Game {game.number}: {game.result.outcome.replaceAll('_', ' ')} · {game.result.homeScore} - {game.result.awayScore}{game.result.completedAt ? ` · ${formatDate(game.result.completedAt)}` : ''}</li>
                    ) : null)}</ul>
                    {entry.finalResult ? <p>Series result: {entry.finalResult.outcome.replaceAll('_', ' ')}{entry.finalResult.advancingParticipant ? ` · Advancing: ${entry.finalResult.advancingParticipant}` : ''}</p> : null}
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