'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../components/page-shell';
import { getPublicSeasonOverview, getPublicSeasonSchedule, PublicSeasonOverview, PublicSeasonSchedule } from '../../lib/api-client';
import styles from '../../components/layout.module.css';

function formatDate(value: string | null, timezone: string) {
  if (!value) return 'Not set';
  try {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: timezone }).format(new Date(value));
  } catch {
    return `${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))} (UTC)`;
  }
}

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

export default function PublicSeasonContent({ seasonId }: { seasonId: string }) {
  const [season, setSeason] = useState<PublicSeasonOverview | null>(null);
  const [schedule, setSchedule] = useState<PublicSeasonSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  async function loadSeason() {
    setLoading(true);
    setError(null);
    try {
      setSeason(await getPublicSeasonOverview(seasonId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this public season.');
    } finally {
      setLoading(false);
    }
  }

  async function loadSchedule() {
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      setSchedule(await getPublicSeasonSchedule(seasonId));
    } catch (loadError) {
      setScheduleError(loadError instanceof Error ? loadError.message : 'Unable to load public phase and schedule data.');
    } finally {
      setScheduleLoading(false);
    }
  }

  useEffect(() => {
    void loadSeason();
    void loadSchedule();
  }, [seasonId]);

  const schedulePhases = schedule?.phases ?? [];
  const scheduledSeries = schedulePhases.flatMap((phase) => phase.series
    .filter((seriesItem) => seriesItem.scheduledAt !== null)
    .map((seriesItem) => ({ phase, series: seriesItem })));
  const generatedSeriesCount = schedulePhases.reduce((total, phase) => total + phase.series.length, 0);

  return (
    <PageShell title={season?.name ?? 'Season'} subtitle="Public season information.">
      <p className={styles.discoveryFooter}>
        <Link href="/competitions">All seasons</Link>
        {season ? <> / <Link href={`/leagues/${season.league.id}`}>{season.league.name}</Link></> : null}
      </p>
      {loading ? <p role="status">Loading season...</p> : null}
      {error ? (
        <div className={styles.publicState} role="alert">
          <p>{error}</p>
          <button className={styles.secondaryButton} onClick={() => void loadSeason()} type="button">Try again</button>
        </div>
      ) : null}
      {season && !loading && !error ? (
        <>
          <section className={styles.publicState}>
            <p className={styles.competitionLeague}><Link href={`/leagues/${season.league.id}`}>{season.league.name}</Link></p>
            <h2>{season.status.replaceAll('_', ' ')}</h2>
            {season.description ? <p>{season.description}</p> : null}
            <div className={styles.competitionMeta}>
              <span>Competition dates: {formatDate(season.startDate, season.timezone)} - {formatDate(season.endDate, season.timezone)}</span>
              <span>Competition timezone: {season.timezone}</span>
              <span>{season.divisions.length} {season.divisions.length === 1 ? 'division' : 'divisions'}</span>
            </div>
          </section>

          <nav aria-label="Season overview sections" className={styles.overviewNav}>
            {season.publishedRules ? <a href="#rules">Published rules</a> : null}
            <a href="#participants">Participants ({season.participantCount})</a>
            {season.phases.length ? <a href="#phases">Phases ({season.phases.length})</a> : null}
            {season.scheduledSeriesCount > 0 ? <a href="#schedule">Schedule ({season.scheduledSeriesCount})</a> : null}
            {season.publishedResultsCount > 0 ? <a href="#results">Results ({season.publishedResultsCount})</a> : null}
          </nav>

          <section id="rules" aria-labelledby="season-rules-heading">
            <h2 id="season-rules-heading">Published season rules</h2>
            {season.publishedRules ? (
              <div className={styles.publicState}>
                <h3>{season.publishedRules.name} · v{season.publishedRules.version}</h3>
                {season.rulesPublishedAt ? <p>Published {formatDate(season.rulesPublishedAt, season.timezone)} ({season.timezone})</p> : null}
                {season.publishedRules.sections.map((section) => (
                  <div key={section.title}>
                    <h4>{section.title}</h4>
                    <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                ))}
              </div>
            ) : <div className={styles.publicState}><p>Published season rules are not available yet.</p></div>}
          </section>

          <section id="participants" aria-labelledby="season-participants-heading">
            <h2 id="season-participants-heading">Participant summary</h2>
            {season.participantCount === 0 ? (
              <div className={styles.publicState}><p>No public participants are available yet.</p></div>
            ) : (
              <div className={styles.publicState}>
                <p>{season.participantCount} active {season.participantCount === 1 ? 'participant' : 'participants'}</p>
                <ul>{season.divisions.map((division) => (
                  <li key={division.id}>{division.name}: {division.participantCount}</li>
                ))}</ul>
              </div>
            )}
          </section>

          <section id="phases" aria-labelledby="season-phases-heading">
            <h2 id="season-phases-heading">Phases</h2>
            {scheduleLoading ? <p role="status">Loading phases...</p> : null}
            {scheduleError ? (
              <div className={styles.publicState} role="alert">
                <p>{scheduleError}</p>
                <button className={styles.secondaryButton} onClick={() => void loadSchedule()} type="button">Try again</button>
              </div>
            ) : null}
            {!scheduleLoading && !scheduleError && schedulePhases.length ? (
              <div className={styles.competitionList}>
                {schedulePhases.map((phase) => (
                  <article className={styles.competitionItem} key={`${phase.number}-${phase.name}`}>
                    <p className={styles.competitionLeague}>{phase.type.replaceAll('_', ' ')}</p>
                    <h3>{phase.name}</h3>
                    <div className={styles.competitionMeta}>
                      <span>{phase.status.replaceAll('_', ' ')}</span>
                      <span>{formatDate(phase.startAt, season.timezone)} - {formatDate(phase.endAt, season.timezone)} ({season.timezone})</span>
                      <span>{phase.series.length} series</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            {!scheduleLoading && !scheduleError && schedulePhases.length === 0
              ? <div className={styles.publicState}><p>Competition phases have not been created yet.</p></div>
              : null}
          </section>

          <section id="schedule" aria-labelledby="season-schedule-heading">
            <h2 id="season-schedule-heading">Schedule</h2>
            {scheduleLoading ? <p role="status">Loading schedule...</p> : null}
            {scheduleError ? (
              <div className={styles.publicState} role="alert">
                <p>{scheduleError}</p>
                <button className={styles.secondaryButton} onClick={() => void loadSchedule()} type="button">Try again</button>
              </div>
            ) : null}
            {!scheduleLoading && !scheduleError && scheduledSeries.length ? (
              <div className={styles.competitionList}>
                {scheduledSeries.map(({ phase, series: seriesItem }) => (
                  <article className={styles.competitionItem} key={`${phase.number}-${seriesItem.number}`}>
                    <p className={styles.competitionLeague}>{phase.name} · <Link href={`/series/${seriesItem.id}`}>Series {seriesItem.number ?? '—'}</Link></p>
                    <h3>{seriesItem.participants.length ? seriesItem.participants.join(' vs ') : 'Participants not announced'}</h3>
                    <div className={styles.competitionMeta}>
                      <span>{seriesItem.status.replaceAll('_', ' ')}</span>
                      <span>{formatDateTime(seriesItem.scheduledAt!, season.timezone)} ({season.timezone})</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            {!scheduleLoading && !scheduleError && scheduledSeries.length === 0 ? (
              <div className={styles.publicState}>
                <p>{generatedSeriesCount === 0 ? 'No series have been generated yet.' : 'Series exist, but no schedule has been published yet.'}</p>
              </div>
            ) : null}
          </section>

          <section id="results" aria-labelledby="season-results-heading">
            <h2 id="season-results-heading">Published results</h2>
            {season.publishedResultsCount > 0 ? (
              <div className={styles.publicState}>
                <p>{season.publishedResultsCount} approved game {season.publishedResultsCount === 1 ? 'result is' : 'results are'} available.</p>
                <Link href={`/competitions/${season.id}/results`}>Browse published results</Link>
              </div>
            ) : <div className={styles.publicState}><p>No published results are available yet.</p></div>}
          </section>
        </>
      ) : null}
    </PageShell>
  );
}