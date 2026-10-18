'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../../components/page-shell';
import { getPublicSeasonResults, PublicSeasonResults } from '../../../lib/api-client';
import styles from '../../../components/layout.module.css';

function formatDateTime(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value));
  } catch {
    return `${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} (UTC)`;
  }
}

export default function PublicSeasonResultsContent({ seasonId }: { seasonId: string }) {
  const [data, setData] = useState<PublicSeasonResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadResults() {
    setLoading(true);
    setError(null);
    try {
      setData(await getPublicSeasonResults(seasonId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load published results.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadResults();
  }, [seasonId]);

  return (
    <PageShell title="Published results" subtitle={data?.season.name ?? 'Public season results'}>
      <p className={styles.discoveryFooter}>
        {data ? <><Link href={`/competitions/${data.season.id}`}>{data.season.name}</Link> · {data.season.league.name}</> : <Link href="/competitions">All competitions</Link>}
      </p>
      {loading ? <p role="status">Loading published results...</p> : null}
      {error ? (
        <div className={styles.publicState} role="alert">
          <p>{error}</p>
          <button className={styles.secondaryButton} onClick={() => void loadResults()} type="button">Try again</button>
        </div>
      ) : null}
      {data && !loading && !error && data.results.length === 0 ? (
        <div className={styles.publicState}>
          <h2>No published results yet</h2>
          <p>Results will appear here after they have been confirmed and released for public viewing.</p>
        </div>
      ) : null}
      {data && !error && data.results.length > 0 ? (
        <div className={styles.competitionList}>
          {data.results.map((series) => {
            const publishedGames = series.games.filter((game) => game.resultStatus === 'PUBLISHED' && game.result);
            return (
              <article className={styles.competitionItem} key={series.id}>
                <p className={styles.competitionLeague}>{series.phase.name} · Series {series.number ?? '—'}</p>
                <h2><Link href={`/series/${series.id}`}>{series.participants.length ? series.participants.join(' vs ') : `Series ${series.number ?? ''}`}</Link></h2>
                {series.scheduledAt ? <p>{formatDateTime(series.scheduledAt, data.season.timezone)} ({data.season.timezone})</p> : null}
                {publishedGames.length ? (
                  <ul>{publishedGames.map((game) => (
                    <li key={game.number}>Game {game.number}: {game.result!.outcome.replaceAll('_', ' ')} · {game.result!.homeScore} - {game.result!.awayScore}</li>
                  ))}</ul>
                ) : <p>No game results are publicly available.</p>}
                {series.finalResult ? <p>Series outcome: {series.finalResult.outcome.replaceAll('_', ' ')}</p> : null}
                <p><Link href={`/competitions/${data.season.id}`}>Back to season</Link></p>
              </article>
            );
          })}
        </div>
      ) : null}
    </PageShell>
  );
}