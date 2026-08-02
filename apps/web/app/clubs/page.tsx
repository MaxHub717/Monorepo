'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageShell from '../components/page-shell';
import { applyToClub, createClub, listClubs, ClubSummary } from '../lib/api-client';

export default function ClubsPage() {
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', tag: '', region: '', description: '' });
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClubs() {
      try {
        const data = await listClubs();
        setClubs(data);
      } catch (err: any) {
        setError(err.message ?? 'Unable to load clubs');
      } finally {
        setLoading(false);
      }
    }
    fetchClubs();
  }, []);

  const clubCount = useMemo(() => clubs.length, [clubs]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const result = await createClub({
        name: form.name,
        tag: form.tag,
        region: form.region || undefined,
        description: form.description || undefined,
      });
      setSuccess(`Club ${result.club.name} submitted for approval.`);
      setClubs((current) => [...current, { ...result.club, members: [] }]);
      setForm({ name: '', tag: '', region: '', description: '' });
    } catch (err: any) {
      setError(err.message ?? 'Unable to create club');
    }
  };

  const handleApply = async (clubId: string) => {
    setError(null);
    setSuccess(null);
    try {
      await applyToClub(clubId);
      setSuccess('Application submitted. Club staff will review your request.');
    } catch (err: any) {
      setError(err.message ?? 'Unable to apply to club');
    }
  };

  return (
    <PageShell title="Clubs" subtitle="Club profiles, rosters, and applications.">
      <section>
        <h2>Club Directory</h2>
        {loading ? (
          <p>Loading clubs…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : clubs.length === 0 ? (
          <p>No clubs are available yet.</p>
        ) : (
          <div className="club-grid">
            {clubs.map((club) => (
              <article key={club.id} className="club-card">
                <h3>{club.name}</h3>
                <p>Status: {club.status}</p>
                <p>Members: {club.members?.length ?? 0}</p>
                {club.status === 'ACTIVE' ? (
                  <button type="button" onClick={() => handleApply(club.id)}>
                    Apply to join
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Create a Club</h2>
        <p>Submit a new club application for approval.</p>
        {success ? <p className="success">{success}</p> : null}
        <form onSubmit={handleSubmit} className="club-form">
          <label>
            Club Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label>
            Tag
            <input value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} required />
          </label>
          <label>
            Region
            <input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} />
          </label>
          <label>
            Description
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          <button type="submit">Submit Club Application</button>
        </form>
      </section>

      <Link href="/">Return home</Link>
    </PageShell>
  );
}
