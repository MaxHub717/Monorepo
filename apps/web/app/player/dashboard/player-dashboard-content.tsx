'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../components/page-shell';
import CareerHistoryContent from '../career-history-content';
import NotificationCenter from '../notification-center';
import {
  getMyPlayerProfile,
  getMyCompetitionSchedule,
  listMySeasonRegistrations,
  listOpenRegistrationSeasons,
  listPublicSeasons,
  OpenSeason,
  PlayerProfile,
  PlayerSchedule,
  PlayerSeasonRegistration,
  PublicSeason,
  registerForSeasonDivision,
  checkInToMySeries,
  updateMyPlayerProfile,
  withdrawFromSeason,
} from '../../lib/api-client';

type PlayerDashboardContentProps = {
  user?: {
    id: string;
    email: string;
    accountStatus?: string;
    emailVerifiedAt?: string | null;
  };
};

export default function PlayerDashboardContent({ user }: PlayerDashboardContentProps = {}) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<OpenSeason[]>([]);
  const [publicSeasons, setPublicSeasons] = useState<PublicSeason[]>([]);
  const [registrations, setRegistrations] = useState<PlayerSeasonRegistration[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(true);
  const [publicSeasonsLoading, setPublicSeasonsLoading] = useState(true);
  const [registrationsLoading, setRegistrationsLoading] = useState(true);
  const [seasonsError, setSeasonsError] = useState<string | null>(null);
  const [publicSeasonsError, setPublicSeasonsError] = useState<string | null>(null);
  const [registrationsError, setRegistrationsError] = useState<string | null>(null);
  const [registeringDivisionId, setRegisteringDivisionId] = useState<string | null>(null);
  const [withdrawingSeasonId, setWithdrawingSeasonId] = useState<string | null>(null);
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<PlayerSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [checkingInSeriesId, setCheckingInSeriesId] = useState<string | null>(null);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [scheduleActionError, setScheduleActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ gamerTag: '', region: '', publicProfile: false });

  useEffect(() => {
    let current = true;
    getMyPlayerProfile().then((result) => {
      if (!current) return;
      setProfile(result);
      setForm({ gamerTag: result.gamer_tag, region: result.region || '', publicProfile: result.public_profile ?? false });
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

    listPublicSeasons().then((result) => {
      if (current) setPublicSeasons(result);
    }).catch((err: unknown) => {
      if (current) setPublicSeasonsError(err instanceof Error ? err.message : 'Unable to load public seasons');
    }).finally(() => {
      if (current) setPublicSeasonsLoading(false);
    });

    listMySeasonRegistrations().then((result) => {
      if (current) setRegistrations(result);
    }).catch((err: unknown) => {
      if (current) setRegistrationsError(err instanceof Error ? err.message : 'Unable to load your registrations');
    }).finally(() => {
      if (current) setRegistrationsLoading(false);
    });

    getMyCompetitionSchedule().then((result) => {
      if (current) setSchedule(result);
    }).catch((err: unknown) => {
      if (current) setScheduleError(err instanceof Error ? err.message : 'Unable to load your competition schedule');
    }).finally(() => {
      if (current) setScheduleLoading(false);
    });

    return () => { current = false; };
  }, []);

  async function refreshParticipation() {
    const [available, mine] = await Promise.allSettled([listOpenRegistrationSeasons(), listMySeasonRegistrations()]);
    if (available.status === 'fulfilled') {
      setSeasons(available.value);
      setSeasonsError(null);
    } else {
      setSeasonsError(available.reason instanceof Error ? available.reason.message : 'Unable to refresh available seasons.');
    }
    if (mine.status === 'fulfilled') {
      setRegistrations(mine.value);
      setRegistrationsError(null);
    } else {
      setRegistrationsError(mine.reason instanceof Error ? mine.reason.message : 'Unable to refresh your registrations.');
    }
    return { registrationsFailed: mine.status === 'rejected' };
  }

  async function refreshPersonalSchedule() {
    setScheduleLoading(true);
    try {
      setSchedule(await getMyCompetitionSchedule());
      setScheduleError(null);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Unable to load your competition schedule');
    } finally {
      setScheduleLoading(false);
    }
  }

  async function checkIn(entry: NonNullable<typeof schedule>['entries'][number]) {
    setCheckingInSeriesId(entry.seriesId);
    setScheduleMessage(null);
    setScheduleActionError(null);
    try {
      const result = await checkInToMySeries(entry.seriesId);
      setScheduleMessage(result.alreadyCheckedIn ? 'You are already checked in.' : 'Check-in recorded.');
      await refreshPersonalSchedule();
    } catch (err) {
      setScheduleActionError(err instanceof Error ? err.message : 'Unable to check in for this series.');
      await refreshPersonalSchedule();
    } finally {
      setCheckingInSeriesId(null);
    }
  }

  async function register(season: OpenSeason, divisionId: string) {
    setRegisteringDivisionId(divisionId);
    setRegistrationMessage(null);
    setRegistrationError(null);
    try {
      const registration = await registerForSeasonDivision(season.id, divisionId);
      if (!registration.id || registration.status !== 'ACTIVE') {
        throw new Error('The server did not confirm this registration.');
      }
      setRegistrationMessage(`You are registered for ${season.name}.`);
      const refreshResult = await refreshParticipation();
      if (refreshResult.registrationsFailed) {
        setRegistrationsError('Registration succeeded, but My Competitions could not be refreshed. Try again to reload your registrations.');
      }
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
        publicProfile: form.publicProfile,
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
          <section id="league-identity">
            <h2>Player Profile</h2>
            <p>Gamer tag: {profile.gamer_tag}</p>
            <p>Region: {profile.region ?? 'N/A'}</p>
            <p>Profile completion: {profile.gamer_tag.trim() ? 'Gamer tag provided' : 'Gamer tag needed'}</p>
          </section>

          <section aria-labelledby="account-status-heading">
            <h2 id="account-status-heading">Account status</h2>
            <p>Account: {user?.accountStatus ?? 'Unavailable'}</p>
            <p>Email verification: {user?.emailVerifiedAt ? 'Verified' : 'Not verified'}</p>
            <p>Player verification: {profile.verification_status}</p>
          </section>

          <section aria-labelledby="competitive-record-heading">
            <h2 id="competitive-record-heading">Competitive record</h2>
            <p>Reputation: {profile.reputation_score}</p>
            <p>Recorded results: {profile.wins} wins, {profile.losses} losses, {profile.draws} draws</p>
            <p>Competitive classification is separate from account activation and is not required to create an identity.</p>
          </section>

          <section aria-labelledby="available-seasons-heading">
            <h2 id="available-seasons-heading">Season Discovery</h2>
            {publicSeasonsLoading ? <p role="status">Loading public seasons...</p> : null}
            {publicSeasonsError ? <p role="alert">{publicSeasonsError}</p> : null}
            {!publicSeasonsLoading && !publicSeasonsError && publicSeasons.length === 0 ? <p>No public seasons are available.</p> : null}
            {publicSeasons.map((season) => {
              const registrationSeason = seasons.find((item) => item.id === season.id);
              const existingRegistration = registrations.find((item) => item.season.id === season.id && item.status === 'ACTIVE');
              return <article key={season.id}>
                <h3>{season.name}</h3>
                <p>League: {season.league.name}</p>
                <p>Season status: {season.status.replaceAll('_', ' ')}</p>
                <p>Dates: {season.startDate ? new Date(season.startDate).toLocaleDateString() : 'Not set'} - {season.endDate ? new Date(season.endDate).toLocaleDateString() : 'Not set'} ({season.timezone})</p>
                {season.divisions.length > 0 ? <ul>{season.divisions.map((division) => <li key={division.id}>
                  {division.name} · {division.type.replaceAll('_', ' ')}
                </li>)}</ul> : <p>Divisions have not been published.</p>}
                {registrationSeason ? <>
                  <p>Registration is currently open.</p>
                  {registrationSeason.rules.available && registrationSeason.rules.playerFacing ? <details>
                    <summary>View Rules</summary>
                    <h4>{registrationSeason.rules.playerFacing.name} · v{registrationSeason.rules.playerFacing.version}</h4>
                    {registrationSeason.rules.playerFacing.sections.map((section) => <section key={section.title}>
                      <h5>{section.title}</h5>
                      <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
                    </section>)}
                  </details> : <p>Published season rules are not available.</p>}
                  <h4>Available divisions</h4>
                  <ul>{registrationSeason.divisions.map((division) => <li key={division.id}>
                    <strong>{division.name}</strong> · {division.type.replaceAll('_', ' ')} · {division.registrationCount} registered
                    {division.availableSlots === null ? ' · Open capacity' : ` · ${division.availableSlots} spaces available`}
                    <button type="button" disabled={Boolean(existingRegistration) || division.availableSlots === 0 || registeringDivisionId !== null || !profile}
                      onClick={() => void register(registrationSeason, division.id)}>
                      {registeringDivisionId === division.id ? 'Registering...' : existingRegistration ? 'Already registered' : 'Register for Season'}
                    </button>
                  </li>)}</ul>
                </> : <p>Registration is not currently available.</p>}
              </article>;
            })}
            {seasonsLoading ? <p role="status">Checking registration availability...</p> : null}
            {seasonsError ? <p role="alert">{seasonsError}</p> : null}
          </section>

          <section id="my-competitions" aria-labelledby="my-registrations-heading">
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

          <section id="personal-schedule" aria-labelledby="personal-schedule-heading">
            <h2 id="personal-schedule-heading">My Schedule</h2>
            {scheduleLoading ? <p role="status">Loading your schedule...</p> : null}
            {scheduleError ? <div role="alert"><p>{scheduleError}</p><button type="button" onClick={() => void refreshPersonalSchedule()}>Retry</button></div> : null}
            {!scheduleLoading && !scheduleError && schedule?.entries.length === 0 ? <p>You have no upcoming scheduled series.</p> : null}
            {schedule?.entries.map((entry) => (
              <article key={entry.seriesId}>
                <h3>{entry.season.name} · {entry.phase.name}{entry.seriesNumber ? ` · Series ${entry.seriesNumber}` : ''}</h3>
                <p>{entry.season.leagueName}{entry.opponent ? ` · vs ${entry.opponent}` : ''}</p>
                <p>Status: {entry.status.replaceAll('_', ' ')}</p>
                <p>Scheduled: {formatScheduleDateTime(entry.scheduledAt, entry.timezone)} ({entry.timezone})</p>
                {entry.checkedInAt ? (
                  <p>Checked in: {formatScheduleDateTime(entry.checkedInAt, entry.timezone)} ({entry.timezone})</p>
                ) : entry.canCheckIn ? (
                  <button type="button" disabled={checkingInSeriesId !== null} onClick={() => void checkIn(entry)}>
                    {checkingInSeriesId === entry.seriesId ? 'Checking in...' : 'Check in'}
                  </button>
                ) : entry.checkInState === 'NOT_OPEN' ? (
                  <p>Check-in opens {formatScheduleDateTime(entry.checkInOpensAt, entry.timezone)} ({entry.timezone}).</p>
                ) : entry.checkInState === 'CLOSED' ? (
                  <p>Check-in is closed.</p>
                ) : (
                  <p>Check-in is not available for this series.</p>
                )}
              </article>
            ))}
            {scheduleMessage ? <p role="status">{scheduleMessage}</p> : null}
            {scheduleActionError ? <p role="alert">{scheduleActionError}</p> : null}
          </section>

          <CareerHistoryContent id="career-history" />

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
              <label>
                <input
                  checked={form.publicProfile}
                  onChange={(event) => setForm({ ...form, publicProfile: event.target.checked })}
                  type="checkbox"
                />
                Show my profile in public player discovery
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

      <NotificationCenter id="notifications" />

      <Link href="/">Return home</Link>
    </PageShell>
  );
}

function formatScheduleDateTime(value: string | null, timezone: string) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  }).format(new Date(value));
}

