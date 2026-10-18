'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../components/page-shell';
import { getPublicSeriesDetail, PublicSeriesDetail } from '../../lib/api-client';
import styles from '../../components/layout.module.css';

function formatDateTime(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return `${new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value))} (UTC)`;
  }
}

export default function PublicSeriesContent({ seriesId }: { seriesId: string }) {
  const [series, setSeries] = useState<PublicSeriesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadSeries() {
    setLoading(true);
    setError(null);
    try {
      setSeries(await getPublicSeriesDetail(seriesId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this public series.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSeries();
  }, [seriesId]);

  return (
    <PageShell title={series ? `Series ${series.number ?? ''}`.trim() : 'Series'} subtitle="Public series details and published outcomes.">
      <p className={styles.discoveryFooter}>
        {series ? <>
          <Link href={`/competitions/${series.season.id}`}>{series.season.name}</Link>
          {' / '}{series.phase.name}
          {' / '}<Link href={`/competitions/${series.season.id}/results`}>Season results</Link>
        </> : <Link href="/competitions">All competitions</Link>}
      </p>
      {loading ? <p role="status">Loading series...</p> : null}
      {error ? (
        <div className={styles.publicState} role="alert">
          <p>{error}</p>
          <button className={styles.secondaryButton} onClick={() => void loadSeries()} type="button">Try again</button>
        </div>
      ) : null}
      {series && !loading && !error ? (
        <>
          <section className={styles.publicState}>
            <p className={styles.competitionLeague}>
              <Link href={`/leagues/${series.season.league.id}`}>{series.season.league.name}</Link>
            </p>
            <h2>{series.season.name} · {series.phase.name}</h2>
            <div className={styles.competitionMeta}>
              <span>Series status: {series.status.replaceAll('_', ' ')}</span>
              <span>Phase status: {series.phase.status.replaceAll('_', ' ')}</span>
              <span>Season status: {series.season.status.replaceAll('_', ' ')}</span>
              {series.scheduledAt ? <span>Scheduled: {formatDateTime(series.scheduledAt, series.timezone)} ({series.timezone})</span> : <span>No schedule published</span>}
            </div>
            <p>Participants: {series.participants.length ? series.participants.join(' vs ') : 'Not announced'}</p>
          </section>

          <section aria-labelledby="series-games-heading">
            <h2 id="series-games-heading">Games</h2>
            {series.games.length ? (
              <div className={styles.competitionList}>
                {series.games.map((game) => (
                  <article className={styles.competitionItem} key={game.number}>
                    <p className={styles.competitionLeague}>Game {game.number}</p>
                    <h3>{game.homeParticipant ?? 'Participant'} vs {game.awayParticipant ?? 'Participant'}</h3>
                    {game.resultStatus === 'PUBLISHED' && game.result ? (
                      <div>
                        <p>{game.result.outcome.replaceAll('_', ' ')} · {game.result.homeScore} - {game.result.awayScore}</p>
                        {game.result.winner ? <p>Winner: {game.result.winner}</p> : null}
                        {game.result.completedAt ? <p>Completed: {formatDateTime(game.result.completedAt, series.timezone)} ({series.timezone})</p> : null}
                      </div>
                    ) : (
                      <p>{game.resultStatus === 'PENDING' ? 'Result pending.' : 'Result is not publicly available.'}</p>
                    )}
                    <p>Game status: {game.status.replaceAll('_', ' ')}</p>
                  </article>
                ))}
              </div>
            ) : <div className={styles.publicState}><p>No games are available for this series.</p></div>}
          </section>

          <section aria-labelledby="series-result-heading">
            <h2 id="series-result-heading">Series result</h2>
            {series.finalResult ? (
              <div className={styles.publicState}>
                <p>Status: {series.finalResult.status.replaceAll('_', ' ')}</p>
                <p>Outcome: {series.finalResult.outcome.replaceAll('_', ' ')}</p>
                {series.finalResult.advancingParticipant ? <p>Advancing: {series.finalResult.advancingParticipant}</p> : null}
              </div>
            ) : <div className={styles.publicState}><p>The final series result has not been published.</p></div>}
          </section>
        </>
      ) : null}
    </PageShell>
  );
}