'use client';

import Link from 'next/link';
import { useState } from 'react';
import PageShell from '../../../components/page-shell';
import {
  DivisionFixturePage,
  DivisionFixtureSchedule,
  generateDivisionFixtures,
  getDivisionFixtures,
  getSeasonFixtureSchedule,
  lockDivisionSchedule,
  SeasonFixtureSchedule,
  updateFixtureSchedule,
} from '../../../lib/api-client';
import styles from './schedule.module.css';

type Props = {
  seasonId: string;
  initialSchedule: SeasonFixtureSchedule;
  initialFixtures: DivisionFixturePage | null;
};

type AppointmentField = 'scheduledAt' | 'checkInOpensAt' | 'checkInClosesAt' | 'playWindowOpensAt' | 'playWindowClosesAt';
type AppointmentDraft = Record<AppointmentField, string>;

function label(value: string) {
  return value.replaceAll('_', ' ');
}

function toLocalDateTime(value: string | null, timezone: string) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function zonedDateTimeToIso(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Enter a valid date and time.');
  const [, year, month, day, hour, minute] = match.map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const sampleOffsets = [-36, -24, -12, 0, 12, 24, 36].map((offsetHours) =>
    timezoneOffsetAt(new Date(wallClockAsUtc + offsetHours * 60 * 60 * 1000), timezone),
  );
  const candidates = [...new Set(sampleOffsets)]
    .map((offset) => wallClockAsUtc - offset)
    .filter((instant) => toLocalDateTime(new Date(instant).toISOString(), timezone) === value)
    .sort((a, b) => a - b);
  if (!candidates.length) {
    throw new Error('That local time does not exist in the division timezone because of a daylight-saving transition.');
  }
  // During a fall-back overlap, choose the earlier matching instant consistently.
  return new Date(candidates[0]).toISOString();
}

function timezoneOffsetAt(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second')) - instant.getTime();
}

function formatDateTime(value: string | null, timezone?: string | null) {
  if (!value) return 'Unscheduled';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(value));
}

function draftFromFixture(fixture: DivisionFixturePage['fixtures'][number], timezone: string): AppointmentDraft {
  return {
    scheduledAt: toLocalDateTime(fixture.scheduledAt, timezone),
    checkInOpensAt: toLocalDateTime(fixture.checkInOpensAt, timezone),
    checkInClosesAt: toLocalDateTime(fixture.checkInClosesAt, timezone),
    playWindowOpensAt: toLocalDateTime(fixture.playWindowOpensAt, timezone),
    playWindowClosesAt: toLocalDateTime(fixture.playWindowClosesAt, timezone),
  };
}

export default function ScheduleWorkspace({ seasonId, initialSchedule, initialFixtures }: Props) {
  const [schedule, setSchedule] = useState(initialSchedule);
  const [divisionId, setDivisionId] = useState(initialSchedule.divisions[0]?.divisionId ?? '');
  const [fixturePage, setFixturePage] = useState(initialFixtures);
  const [page, setPage] = useState(1);
  const [appointmentDrafts, setAppointmentDrafts] = useState<Record<string, AppointmentDraft>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const division = schedule.divisions.find((item) => item.divisionId === divisionId) ?? null;
  const fixtures = fixturePage?.fixtures ?? [];
  const canGenerate = Boolean(
    division &&
    schedule.seasonStatus === 'ROSTER_LOCKED' &&
    division.active &&
    !division.scheduleLocked &&
    division.generationStatus === 'NOT_GENERATED',
  );
  const canLock = Boolean(
    division &&
    schedule.seasonStatus === 'ROSTER_LOCKED' &&
    division.active &&
    !division.scheduleLocked &&
    division.generationStatus === 'GENERATED' &&
    division.validation?.valid &&
    division.unscheduledFixtureCount === 0 &&
    division.conflictCount === 0,
  );

  async function loadDivision(nextDivisionId: string, nextPage: number) {
    if (!nextDivisionId) {
      setFixturePage(null);
      return;
    }
    const result = await getDivisionFixtures(seasonId, nextDivisionId, nextPage, 25);
    setFixturePage(result);
  }

  async function refresh(nextDivisionId = divisionId, nextPage = page) {
    const nextSchedule = await getSeasonFixtureSchedule(seasonId);
    setSchedule(nextSchedule);
    const stillExists = nextSchedule.divisions.some((item) => item.divisionId === nextDivisionId);
    const resolvedDivisionId = stillExists ? nextDivisionId : nextSchedule.divisions[0]?.divisionId ?? '';
    setDivisionId(resolvedDivisionId);
    setPage(nextPage);
    await loadDivision(resolvedDivisionId, nextPage);
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await refresh();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update the schedule');
    } finally {
      setBusy(false);
    }
  }

  async function selectDivision(nextDivisionId: string) {
    setDivisionId(nextDivisionId);
    setPage(1);
    setMessage(null);
    try {
      await loadDivision(nextDivisionId, 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load division fixtures');
    }
  }

  function getDraft(fixture: DivisionFixturePage['fixtures'][number]): AppointmentDraft {
    return appointmentDrafts[fixture.id] ?? draftFromFixture(fixture, fixture.timezone ?? division?.matchWindowTimezone ?? 'UTC');
  }

  function setAppointmentField(fixture: DivisionFixturePage['fixtures'][number], field: AppointmentField, value: string) {
    setAppointmentDrafts((current) => ({
      ...current,
      [fixture.id]: { ...getDraft(fixture), [field]: value },
    }));
  }

  async function saveSchedule(fixture: DivisionFixturePage['fixtures'][number]) {
    const draft = getDraft(fixture);
    const values = [
      draft.scheduledAt,
      draft.checkInOpensAt,
      draft.checkInClosesAt,
      draft.playWindowOpensAt,
      draft.playWindowClosesAt,
    ];
    if (values.some((value) => !value)) {
      setMessage('Enter the appointment time, check-in period, and play window before saving.');
      return;
    }
    const timezone = division?.matchWindowTimezone ?? 'UTC';
    let instants: string[];
    try {
      instants = values.map((value) => zonedDateTimeToIso(value, timezone));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Enter valid times in the division timezone.');
      return;
    }
    await runAction(
      () => updateFixtureSchedule(seasonId, divisionId, fixture.id, {
        scheduledAt: instants[0],
        timezone,
        checkInOpensAt: instants[1],
        checkInClosesAt: instants[2],
        playWindowOpensAt: instants[3],
        playWindowClosesAt: instants[4],
      }),
      'Fixture schedule saved.',
    );
  }

  return (
    <PageShell title="Schedule" subtitle={`${schedule.leagueName} · ${schedule.seasonName}`}>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <Link href={`/seasons/${seasonId}`} className={styles.backLink}>Season workspace</Link>
            <p className={styles.eyebrow}>Scheduling workspace</p>
            <h2>{schedule.seasonName}</h2>
            <p>{schedule.leagueName} · {label(schedule.seasonStatus)}</p>
          </div>
          <span className={styles.lockBadge}>{division?.scheduleLocked ? 'Schedule locked' : 'Schedule open'}</span>
        </header>

        {schedule.divisions.length === 0 ? (
          <section className={styles.emptyState}>
            <h3>No divisions configured</h3>
            <p>This season has no divisions to schedule.</p>
          </section>
        ) : (
          <>
            <section className={styles.toolbar}>
              <label className={styles.divisionSelect}>
                Division
                <select value={divisionId} onChange={(event) => selectDivision(event.target.value)} disabled={busy}>
                  {schedule.divisions.map((item) => (
                    <option key={item.divisionId} value={item.divisionId}>{item.divisionName}</option>
                  ))}
                </select>
              </label>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy || !canGenerate}
                  onClick={() => division && runAction(
                    () => generateDivisionFixtures(seasonId, division.divisionId),
                    'Fixtures generated.',
                  )}
                >
                  Generate fixtures
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy || !canLock}
                  onClick={() => division && runAction(
                    () => lockDivisionSchedule(seasonId, division.divisionId),
                    'Schedule locked.',
                  )}
                >
                  Lock schedule
                </button>
              </div>
            </section>

            {division && (
              <>
                <section className={styles.summary} aria-label="Schedule summary">
                  <div><span>Format</span><strong>{label(division.format)}</strong></div>
                  <div><span>Participants</span><strong>{division.participantCount}</strong></div>
                  <div><span>Total fixtures</span><strong>{division.currentFixtureCount} / {division.expectedFixtureCount}</strong></div>
                  <div><span>Scheduled</span><strong>{division.scheduledFixtureCount}</strong></div>
                  <div><span>Unscheduled</span><strong>{division.unscheduledFixtureCount}</strong></div>
                  <div><span>Current round</span><strong>{division.currentRound ?? '—'}</strong></div>
                  <div><span>Scheduling status</span><strong>{division.scheduleLocked ? 'Locked' : label(division.generationStatus)}</strong></div>
                  <div><span>Conflicts</span><strong>{division.conflictCount ?? 'Not checked'}</strong></div>
                </section>

                {division.blockers.length > 0 && (
                  <section className={styles.noticeError} aria-label="Schedule blockers">
                    <h3>Blockers</h3>
                    <ul>{division.blockers.map((item) => <li key={item}>{item}</li>)}</ul>
                  </section>
                )}
                {division.warnings.length > 0 && (
                  <section className={styles.noticeWarning} aria-label="Schedule warnings">
                    <h3>Warnings</h3>
                    <ul>{division.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
                  </section>
                )}
                {message && <p className={styles.message} role="status">{message}</p>}

                <section className={styles.fixtureSection}>
                  <header className={styles.sectionHeader}>
                    <div><p className={styles.eyebrow}>Division fixtures</p><h3>{division.divisionName}</h3></div>
                    <span>{fixturePage?.pagination.total ?? 0} fixtures</span>
                  </header>
                  {fixtures.length === 0 ? (
                    <div className={styles.emptyState}>
                      <h3>{division.generationStatus === 'NOT_GENERATED' ? 'No fixtures generated' : 'No fixtures to display'}</h3>
                      <p>{division.generationStatus === 'NOT_GENERATED' ? 'Generate the complete selected competition format to begin scheduling.' : 'Resolve the listed blockers before generating this schedule.'}</p>
                    </div>
                  ) : (
                    <>
                      <div className={styles.tableWrap}>
                        <table>
                          <thead><tr><th>Fixture</th><th>Round</th><th>Participants</th><th>Match status</th><th>Appointment</th><th>Action</th></tr></thead>
                          <tbody>
                            {fixtures.map((fixture) => {
                              const canSchedule = schedule.seasonStatus === 'ROSTER_LOCKED' &&
                                !division.scheduleLocked && fixture.matchStatus === 'SCHEDULED';
                              const draft = getDraft(fixture);
                              return (
                                <tr key={fixture.id}>
                                  <td>#{fixture.fixtureNumber ?? '—'}</td>
                                  <td>{fixture.roundNumber ?? '—'}</td>
                                  <td>{fixture.homePlayer.gamerTag} <span className={styles.versus}>vs</span> {fixture.awayPlayer.gamerTag}</td>
                                  <td>{label(fixture.schedulingStatus)} · {label(fixture.matchStatus ?? fixture.status)}</td>
                                  <td>
                                    {canSchedule ? (
                                      <details className={styles.appointmentDetails} open={!fixture.scheduledAt}>
                                        <summary>{formatDateTime(fixture.scheduledAt, fixture.timezone ?? division.matchWindowTimezone)}</summary>
                                        <div className={styles.appointmentFields}>
                                          <label>Appointment<input type="datetime-local" value={draft.scheduledAt} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'scheduledAt', event.target.value)} /></label>
                                          <label>Check-in opens<input type="datetime-local" value={draft.checkInOpensAt} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'checkInOpensAt', event.target.value)} /></label>
                                          <label>Check-in closes<input type="datetime-local" value={draft.checkInClosesAt} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'checkInClosesAt', event.target.value)} /></label>
                                          <label>Play window opens<input type="datetime-local" value={draft.playWindowOpensAt} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'playWindowOpensAt', event.target.value)} /></label>
                                          <label>Play window closes<input type="datetime-local" value={draft.playWindowClosesAt} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'playWindowClosesAt', event.target.value)} /></label>
                                          <span className={styles.timezoneNote}>Timezone: {division.matchWindowTimezone}</span>
                                        </div>
                                      </details>
                                    ) : <div className={styles.appointmentReadOnly}>
                                      <strong>{formatDateTime(fixture.scheduledAt, fixture.timezone)}</strong>
                                      <span>{fixture.schedulingStatus} · {fixture.timezone ?? 'Timezone not set'}</span>
                                      {fixture.checkInOpensAt && <span>Check-in: {formatDateTime(fixture.checkInOpensAt, fixture.timezone)} – {formatDateTime(fixture.checkInClosesAt, fixture.timezone)}</span>}
                                      {fixture.playWindowOpensAt && <span>Play: {formatDateTime(fixture.playWindowOpensAt, fixture.timezone)} – {formatDateTime(fixture.playWindowClosesAt, fixture.timezone)}</span>}
                                    </div>}
                                  </td>
                                  <td>
                                    {canSchedule ? (
                                      <button type="button" className={styles.rowButton} disabled={busy} onClick={() => saveSchedule(fixture)}>
                                        {fixture.scheduledAt ? 'Reschedule' : 'Schedule'}
                                      </button>
                                    ) : fixture.scheduledAt ? 'Scheduled' : 'Unscheduled'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <footer className={styles.pagination}>
                        <span>Page {fixturePage?.pagination.page ?? 1} of {fixturePage?.pagination.totalPages ?? 1}</span>
                        <div>
                          <button type="button" className={styles.rowButton} disabled={busy || page <= 1} onClick={async () => { const next = page - 1; setPage(next); await loadDivision(divisionId, next); }}>Previous</button>
                          <button type="button" className={styles.rowButton} disabled={busy || page >= (fixturePage?.pagination.totalPages ?? 1)} onClick={async () => { const next = page + 1; setPage(next); await loadDivision(divisionId, next); }}>Next</button>
                        </div>
                      </footer>
                    </>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </PageShell>
  );
}