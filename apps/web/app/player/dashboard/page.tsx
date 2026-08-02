'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../components/page-shell';
import { getMyPlayerProfile, updateMyPlayerProfile, PlayerProfile } from '../../lib/api-client';

export default function PlayerDashboardPage() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ gamerTag: '', region: '' });

  useEffect(() => {
    async function loadProfile() {
      try {
        const result = await getMyPlayerProfile();
        setProfile(result);
        setForm({ gamerTag: result.gamer_tag, region: result.region || '' });
      } catch (err: any) {
        setError(err.message ?? 'Unable to load profile');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const updated = await updateMyPlayerProfile({
        gamerTag: form.gamerTag,
        region: form.region || undefined,
      });
      setProfile(updated);
      setMessage('Profile updated successfully.');
    } catch (err: any) {
      setError(err.message ?? 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="Player Dashboard" subtitle="Your profile, fixtures, and match actions.">
      {loading ? (
        <p>Loading your profile…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : profile ? (
        <>
          <section>
            <h2>Player Profile</h2>
            <p>Gamer tag: {profile.gamer_tag}</p>
            <p>Region: {profile.region ?? 'N/A'}</p>
            <p>Verification status: {profile.verification_status}</p>
            <p>Player status: {profile.player_status}</p>
            <p>Reputation: {profile.reputation_score}</p>
            <p>Record: {profile.wins}W / {profile.losses}L / {profile.draws}D</p>
          </section>

          <section>
            <h2>Edit Profile</h2>
            {message ? <p className="success">{message}</p> : null}
            <form onSubmit={handleSubmit} className="player-form">
              <label>
                Gamer Tag
                <input value={form.gamerTag} onChange={(event) => setForm({ ...form, gamerTag: event.target.value })} required />
              </label>
              <label>
                Region
                <input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} />
              </label>
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
            </form>
          </section>
        </>
      ) : (
        <p>No player profile is available.</p>
      )}

      <Link href="/">Return home</Link>
    </PageShell>
  );
}
