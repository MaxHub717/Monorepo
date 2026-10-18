'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getMyCareer,
  listMySeasonRegistrations,
  PersonalPlayerCareer,
  PlayerSeasonRegistration,
} from '../lib/api-client';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

export default function CareerHistoryContent({ id }: { id?: string }) {
  const [career, setCareer] = useState<PersonalPlayerCareer | null>(null);
  const [careerLoading, setCareerLoading] = useState(true);
  const [careerError, setCareerError] = useState<string | null>(null);
  const [participations, setParticipations] = useState<PlayerSeasonRegistration[]>([]);
  const [participationsLoading, setParticipationsLoading] = useState(true);
  const [participationsError, setParticipationsError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getMyCareer().then((result) => {
      if (current) setCareer(result);
    }).catch((error: unknown) => {
      if (current) setCareerError(error instanceof Error ? error.message : 'Unable to load your career history.');
    }).finally(() => {
      if (current) setCareerLoading(false);
    });
    listMySeasonRegistrations().then((result) => {
      if (current) setParticipations(result);
    }).catch((error: unknown) => {
      if (current) setParticipationsError(error instanceof Error ? error.message : 'Unable to load your competition participation.');
    }).finally(() => {
      if (current) setParticipationsLoading(false);
    });
    return () => { current = false; };
  }, []);

  async function retryCareer() {
    setCareerLoading(true);
    setCareerError(null);
    try {
      setCareer(await getMyCareer());
    } catch (error) {
      setCareerError(error instanceof Error ? error.message : 'Unable to load your career history.');
    } finally {
      setCareerLoading(false);
    }
  }

  async function retryParticipations() {
    setParticipationsLoading(true);
    setParticipationsError(null);
    try {
      setParticipations(await listMySeasonRegistrations());
    } catch (error) {
      setParticipationsError(error instanceof Error ? error.message : 'Unable to load your competition participation.');
    } finally {
      setParticipationsLoading(false);
    }
  }

  return (
    <section id={id} aria-labelledby="career-history-heading">
      <h2 id="career-history-heading">Career History</h2>
      <p>Published competition results and your recorded season participation.</p>

      <section aria-labelledby="participation-history-heading">
        <h3 id="participation-history-heading">Season Participation</h3>
        {participationsLoading ? <p role="status">Loading your competition participation...</p> : null}
        {participationsError ? <div role="alert"><p>{participationsError}</p><button type="button" onClick={() => void retryParticipations()}>Retry</button></div> : null}
        {!participationsLoading && !participationsError && participations.length === 0
          ? <p>No season participation is recorded yet. Explore competitions to find an eligible season.</p>
          : null}
        {!participationsError && participations.length > 0 ? (
          <ul>{participations.map((participation) => (
            <li key={participation.id}>
              <Link href={`/seasons/${participation.season.id}`}>{participation.season.name}</Link>
              {' · '}{participation.season.league.name} · {participation.division.name}
              {' · '}{participation.status.replaceAll('_', ' ')}
              {' · Registered '}{formatDate(participation.registered_at)}
            </li>
          ))}</ul>
        ) : null}
      </section>

      <section aria-labelledby="published-career-results-heading">
        <h3 id="published-career-results-heading">Published Results</h3>
        {careerLoading ? <p role="status">Loading published career results...</p> : null}
        {careerError ? <div role="alert"><p>{careerError}</p><button type="button" onClick={() => void retryCareer()}>Retry</button></div> : null}
        {!careerLoading && !careerError && career?.career.length === 0
          ? <p>No published competition results are available yet.</p>
          : null}
        {!careerError && career?.career.length ? (
          <ul>{career.career.map((entry) => (
            <li key={entry.seriesId}>
              <p>{entry.phase.name} · Series {entry.seriesNumber ?? '—'} · {entry.participants.join(' vs ')}</p>
              <h4><Link href={`/series/${entry.seriesId}`}>{entry.season.name}</Link></h4>
              <ul>{entry.games.map((game) => game.result ? (
                <li key={game.number}>
                  Game {game.number}: {game.result.outcome.replaceAll('_', ' ')} · {game.result.homeScore} - {game.result.awayScore}
                  {game.result.completedAt ? ` · ${formatDate(game.result.completedAt)}` : ''}
                </li>
              ) : null)}</ul>
              {entry.finalResult ? <p>
                Series result: {entry.finalResult.outcome.replaceAll('_', ' ')}
                {entry.finalResult.advancingParticipant ? ` · Advancing: ${entry.finalResult.advancingParticipant}` : ''}
              </p> : null}
            </li>
          ))}</ul>
        ) : null}
      </section>
    </section>
  );
}