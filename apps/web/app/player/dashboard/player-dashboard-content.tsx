'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../components/page-shell';
import {
  getMyPlayerProfile,
  listMySeasonRegistrations,
  listOpenRegistrationSeasons,
  OpenSeason,
  PlayerProfile,
  PlayerSeasonRegistration,
  registerForSeasonDivision,
  updateMyPlayerProfile,
  withdrawFromSeason,
} from '../../lib/api-client';

type PlayerDashboardContentProps = {
  user?: {
    id: string;
    email: string;
  };
};

export default function PlayerDashboardContent({ user }: PlayerDashboardContentProps = {}) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<OpenSeason[]>([]);
  const [registrations, setRegistrations] = useState<PlayerSeasonRegistration[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(true);
  const [registrationsLoading, setRegistrationsLoading] = useState(true);
  const [seasonsError, setSeasonsError] = useState<string | null>(null);
  const [registrationsError, setRegistrationsError] = useState<string | null>(null);
  const [registeringDivisionId, setRegisteringDivisionId] = useState<string | null>(null);
  const [withdrawingSeasonId, setWithdrawingSeasonId] = useState<string | null>(null);
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ gamerTag: '', region: '' });

  useEffect(() => {
    let current = true;
    getMyPlayerProfile().then((result) => {
      if (!current) return;
      setProfile(result);
      setForm({ gamerTag: result.gamer_tag, region: result.region || '' });
    }).catch((err: unknown) => {
      if (current) setError(err instanceof Error ? err.message : 'Unable to load profile');
    }).finally(() => {
      if (current) setLoading(false);
    });

    listOpenRegistrationSeasons().then((result) => {
      if (current) setSeasons(result);
    }).catch((err: unknown) => {
      if (current) setSeasonsError(err instanceof Error ? err.message : 'Unable to load available seasons');
    }).finally(() => {
      if (current) setSeasonsLoading(false);
    });

    listMySeasonRegistrations().then((result) => {
      if (current) setRegistrations(result);
    }).catch((err: unknown) => {
      if (current) setRegistrationsError(err instanceof Error ? err.message : 'Unable to load your registrations');
    }).finally(() => {
      if (current) setRegistrationsLoading(false);
    });

    return () => { current = false; };
  }, []);

  async function refreshParticipation() {
    const [available, mine] = await Promise.all([listOpenRegistrationSeasons(), listMySeasonRegistrations()]);
    setSeasons(available);
    setRegistrations(mine);
  }

  async function register(season: OpenSeason, divisionId: string) {
    setRegisteringDivisionId(divisionId);
    setRegistrationMessage(null);
    setRegistrationError(null);
    try {
      await registerForSeasonDivision(season.id, divisionId);
      setRegistrationMessage(`You are registered for ${season.name}.`);
      await refreshParticipation();
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : 'Unable to register for this division.');
    } finally {
      setRegisteringDivisionId(null);
    }
  }

  async function withdraw(registration: PlayerSeasonRegistration) {
    setWithdrawingSeasonId(registration.season.id);
    setRegistrationMessage(null);
    setRegistrationError(null);
    try {
      await withdrawFromSeason(registration.season.id);
      setRegistrationMessage(`Your registration for ${registration.season.name} was withdrawn.`);
      await refreshParticipation();
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : 'Unable to withdraw from this season.');
    } finally {
      setWithdrawingSeasonId(null);
    }
  }

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
    <PageShell title="Player Dashboard" subtitle="Discover seasons, manage registrations, and update your profile.">
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

          <section aria-labelledby="available-seasons-heading">
            <h2 id="available-seasons-heading">Available Seasons</h2>
            {seasonsLoading ? <p role="status">Loading open seasons...</p> : null}
            {seasonsError ? <p role="alert">{seasonsError}</p> : null}
            {!seasonsLoading && !seasonsError && seasons.length === 0 ? <p>No seasons are currently open for registration.</p> : null}
            {seasons.map((season) => {
              const existingRegistration = registrations.find((item) => item.season.id === season.id && item.status === 'ACTIVE');
              return <article key={season.id}>
                <h3>{season.name}</h3>
                <p>League: {season.league.name}</p>
                <p>Status: {season.status.replaceAll('_', ' ')}</p>
                <p>Dates: {new Date(season.startDate).toLocaleDateString()} - {new Date(season.endDate).toLocaleDateString()} ({season.timezone})</p>
                <p>Registration closes: {season.registrationCloseAt ? new Date(season.registrationCloseAt).toLocaleString() : 'Not set'}</p>
                {season.rules.available && season.rules.playerFacing ? <details>
                  <summary>View Rules</summary>
                  <h4>{season.rules.playerFacing.name} · v{season.rules.playerFacing.version}</h4>
                  {season.rules.playerFacing.sections.map((section) => <section key={section.title}>
                    <h5>{section.title}</h5>
                    <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
                  </section>)}
                </details> : <p>Published season rules are not available.</p>}
                <h4>Available divisions</h4>
                <ul>{season.divisions.map((division) => <li key={division.id}>
                  <strong>{division.name}</strong> · {division.type.replaceAll('_', ' ')} · {division.registrationCount} registered
                  {division.availableSlots === null ? ' · Open capacity' : ` · ${division.availableSlots} spaces available`}
                  <button type="button" disabled={Boolean(existingRegistration) || division.availableSlots === 0 || registeringDivisionId !== null || !profile}
                    onClick={() => void register(season, division.id)}>
                    {registeringDivisionId === division.id ? 'Registering...' : existingRegistration ? 'Already registered' : 'Register for Season'}
                  </button>
                </li>)}</ul>
              </article>;
            })}
          </section>

          <section aria-labelledby="my-registrations-heading">
            <h2 id="my-registrations-heading">My Competitions / My Registrations</h2>
            {registrationsLoading ? <p role="status">Loading your registrations...</p> : null}
            {registrationsError ? <p role="alert">{registrationsError}</p> : null}
            {!registrationsLoading && !registrationsError && registrations.length === 0 ? <p>You are not registered for any seasons.</p> : null}
            <ul>{registrations.map((registration) => <li key={registration.id}>
              <strong>{registration.season.name}</strong> · {registration.season.league.name} · {registration.division.name}
              <p>Status: {registration.status.replaceAll('_', ' ')}</p>
              {registration.status === 'ACTIVE' && ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(registration.season.status)
                ? <button type="button" disabled={withdrawingSeasonId !== null} onClick={() => void withdraw(registration)}>
                    {withdrawingSeasonId === registration.season.id ? 'Withdrawing...' : 'Withdraw'}
                  </button>
                : null}
            </li>)}</ul>
          </section>

          {registrationMessage && <p role="status">{registrationMessage}</p>}
          {registrationError && <p role="alert">{registrationError}</p>}

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

