"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../components/page-shell';
import { listSeasons, publishSeason, closeSeasonRegistration, activateSeason, startSeasonPlayoffs, completeSeason, archiveSeason, createDivision, updateDivision, deactivateDivision, SeasonSummary } from '../lib/api-client';

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await listSeasons();
        setSeasons(data);
      } catch (err: any) {
        setError(err.message ?? 'Unable to load seasons');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handlePublish = async (id: string) => {
    try {
      await publishSeason(id);
      setSeasons(await listSeasons());
    } catch (err: any) {
      setError(err.message ?? 'Failed to publish');
    }
  };

  const handleClose = async (id: string) => {
    try {
      await closeSeasonRegistration(id);
      setSeasons(await listSeasons());
    } catch (err: any) {
      setError(err.message ?? 'Failed to close registration');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await activateSeason(id);
      setSeasons(await listSeasons());
    } catch (err: any) {
      setError(err.message ?? 'Failed to activate');
    }
  };

  const handleStartPlayoffs = async (id: string) => {
    try {
      await startSeasonPlayoffs(id);
      setSeasons(await listSeasons());
    } catch (err: any) {
      setError(err.message ?? 'Failed to start playoffs');
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await completeSeason(id);
      setSeasons(await listSeasons());
    } catch (err: any) {
      setError(err.message ?? 'Failed to complete');
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveSeason(id);
      setSeasons(await listSeasons());
    } catch (err: any) {
      setError(err.message ?? 'Failed to archive');
    }
  };

  return (
    <PageShell title="Seasons" subtitle="Manage seasons, divisions, and roster periods.">
      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
        <div className="season-list">
          {seasons.map((s) => (
            <article key={s.id} className="season-card">
              <h3>{s.name}</h3>
              <p>Status: {s.status}</p>
              <p>
                Registration: {s.registration_open_at ?? '—'} → {s.registration_close_at ?? '—'}
              </p>
              <div className="actions">
                {s.status === 'DRAFT' && <button onClick={() => handlePublish(s.id)}>Publish (open registration)</button>}
                {s.status === 'REGISTRATION_OPEN' && <button onClick={() => handleClose(s.id)}>Close Registration</button>}
                {s.status === 'REGISTRATION_CLOSED' && <button onClick={() => handleActivate(s.id)}>Activate Season</button>}
                {s.status === 'ACTIVE' && <button onClick={() => handleStartPlayoffs(s.id)}>Start Playoffs</button>}
                {s.status === 'PLAYOFFS' && <button onClick={() => handleComplete(s.id)}>Complete Season</button>}
                {s.status !== 'ARCHIVED' && <button onClick={() => handleArchive(s.id)}>Archive</button>}
              </div>

              <div className="divisions">
                <h4>Divisions</h4>
                {s.divisions?.length ? (
                  <ul>
                    {s.divisions!.map((d) => (
                      <li key={d.id}>{d.name} — {d.capacity} players — {d.active ? 'active' : 'inactive'}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No divisions</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Link href="/">Return home</Link>
    </PageShell>
  );
}
