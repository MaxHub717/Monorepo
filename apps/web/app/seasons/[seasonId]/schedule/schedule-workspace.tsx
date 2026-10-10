'use client';

import Link from 'next/link';
import { useState } from 'react';
import PageShell from '../../../components/page-shell';
import {
  DivisionFixturePage,
  generateDivisionSchedule,
  getDivisionFixtures,
  getSeasonFixtureSchedule,
  lockDivisionSchedule,
  SeasonFixtureSchedule,
  updateFixtureSchedule,
  validateDivisionSchedule,
  ScheduleValidationResult,
} from '../../../lib/api-client';
import styles from './schedule.module.css';

type Props = {
  seasonId: string;
  initialSchedule: SeasonFixtureSchedule;
  initialFixtures: DivisionFixturePage | null;
  initialLoadError?: string;
  initialFixturesError?: string;
};

type AppointmentField = 'scheduledAt' | 'checkInOpensAt' | 'checkInClosesAt' | 'playWindowOpensAt' | 'playWindowClosesAt';
type AppointmentDraft = Record<AppointmentField, string> & { timezone: string; reason: string };

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

function formatDate(value: string | null, timezone?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(value));
}

function formatTime(value: string | null, timezone?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', {
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
    timezone,
    reason: '',
  };
}

export default function ScheduleWorkspace({
  seasonId,
  initialSchedule,
  initialFixtures,
  initialLoadError,
  initialFixturesError,
}: Props) {
  const [schedule, setSchedule] = useState(initialSchedule);
  const [divisionId, setDivisionId] = useState(initialSchedule.divisions[0]?.divisionId ?? '');
  const [fixturePage, setFixturePage] = useState(initialFixtures);
  const [fixturesLoading, setFixturesLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [appointmentDrafts, setAppointmentDrafts] = useState<Record<string, AppointmentDraft>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(initialLoadError ?? initialFixturesError ?? null);
  const [messageIsError, setMessageIsError] = useState(Boolean(initialLoadError || initialFixturesError));
  const [validationReport, setValidationReport] = useState<ScheduleValidationResult | null>(null);

  const division = schedule.divisions.find((item) => item.divisionId === divisionId) ?? null;
  const fixtures = fixturePage?.fixtures ?? [];
  const currentConflictCount = validationReport?.summary.conflicts ?? division?.conflictCount;
 const fixturesReady = Boolean(
  division &&
  division.generationStatus === 'GENERATED' &&
  division.expectedFixtureCount > 0 &&
  division.currentFixtureCount === division.expectedFixtureCount,
);

const scheduleComplete = Boolean(
  division &&
  division.currentFixtureCount > 0 &&
  division.scheduledFixtureCount === division.currentFixtureCount &&
  division.unscheduledFixtureCount === 0,
);

const scheduleStarted = Boolean(
  division &&
  division.scheduledFixtureCount > 0,
);

const canGenerate = Boolean(
  division &&
  schedule.seasonStatus === 'ROSTER_LOCKED' &&
  division.active &&
  !division.scheduleLocked &&
  fixturesReady &&
  !scheduleComplete,
);
 const canLock = Boolean(
  division &&
  schedule.seasonStatus === 'ROSTER_LOCKED' &&
  division.active &&
  !division.scheduleLocked &&
  fixturesReady &&
  scheduleComplete &&
    !division.scheduleValidationRequired &&
    division.generationStatus === 'GENERATED' &&
    division.currentFixtureCount === division.expectedFixtureCount &&
    division.expectedFixtureCount > 0 &&
    division.scheduledFixtureCount === division.expectedFixtureCount &&
    division.unscheduledFixtureCount === 0 &&
    division.validation?.valid &&
    currentConflictCount === 0 &&
    (validationReport === null || validationReport.valid),
  );
  const scheduleGenerated = scheduleComplete;
  const scheduleValid = canLock;

  async function loadDivision(nextDivisionId: string, nextPage: number) {
    if (!nextDivisionId) {
      setFixturePage(null);
      return;
    }
    setFixturesLoading(true);
    try {
      const result = await getDivisionFixtures(seasonId, nextDivisionId, nextPage, 25);
      setFixturePage(result);
    } finally {
      setFixturesLoading(false);
    }
  }

  async function refresh(nextDivisionId = divisionId, nextPage = page) {
    const nextSchedule = await getSeasonFixtureSchedule(seasonId);
    setSchedule(nextSchedule);
    const stillExists = nextSchedule.divisions.some((item) => item.divisionId === nextDivisionId);
    const resolvedDivisionId = stillExists ? nextDivisionId : nextSchedule.divisions[0]?.divisionId ?? '';
    setDivisionId(resolvedDivisionId);
    setPage(nextPage);
    await loadDivision(resolvedDivisionId, nextPage);
    setMessage(null);
    setMessageIsError(false);
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setMessage(null);
    setMessageIsError(false);
    setValidationReport(null);
    try {
      await action();
      await refresh();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update the schedule');
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function selectDivision(nextDivisionId: string) {
    setDivisionId(nextDivisionId);
    setPage(1);
    setFixturePage(null);
    setMessage(null);
    setMessageIsError(false);
    setValidationReport(null);
    try {
      await loadDivision(nextDivisionId, 1);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load division fixtures');
      setMessageIsError(true);
    }
  }

  async function goToPage(nextPage: number) {
    setPage(nextPage);
    setMessage(null);
    setMessageIsError(false);
    try {
      await loadDivision(divisionId, nextPage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load this page of fixtures');
      setMessageIsError(true);
    }
  }

  function getDraft(fixture: DivisionFixturePage['fixtures'][number]): AppointmentDraft {
    return appointmentDrafts[fixture.id] ?? draftFromFixture(fixture, fixture.timezone ?? division?.matchWindowTimezone ?? 'UTC');
  }

  function setAppointmentField(
    fixture: DivisionFixturePage['fixtures'][number],
    field: AppointmentField | 'timezone' | 'reason',
    value: string,
  ) {
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
      setMessageIsError(true);
      return;
    }
    const timezone = draft.timezone.trim();
    if (!timezone) {
      setMessage('Enter an IANA timezone before saving.');
      setMessageIsError(true);
      return;
    }
    let instants: string[];
    try {
      instants = values.map((value) => zonedDateTimeToIso(value, timezone));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Enter valid times in the division timezone.');
      setMessageIsError(true);
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
        reason: draft.reason || undefined,
      }),
      'Fixture adjusted. Validate the whole schedule before it can be locked.',
    );
    setValidationReport(null);
  }

  async function validateSchedule() {
    if (!division) return;
    setBusy(true);
    setMessage(null);
    setMessageIsError(false);
    try {
      const result = await validateDivisionSchedule(seasonId, division.divisionId);
      setValidationReport(result);
      await refresh();
      setMessage(result.valid
        ? 'Whole schedule validated and ready to lock.'
        : `Schedule validation found ${result.summary.errors} error(s).`);
      setMessageIsError(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to validate the schedule');
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function retryLoad() {
    setBusy(true);
    setMessage(null);
    setMessageIsError(false);
    try {
      await refresh(divisionId, page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reload schedule data');
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  function reviewSchedule() {
    document.getElementById('fixture-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            <h3>{initialLoadError ? 'Schedule data unavailable' : 'No divisions configured'}</h3>
            <p>{initialLoadError ?? 'This season has no divisions to schedule.'}</p>
            {initialLoadError && <button type="button" className={styles.rowButton} disabled={busy} onClick={retryLoad}>Retry loading schedule</button>}
          </section>
        ) : (
          <>
            <section className={styles.toolbar}>
              <label className={styles.divisionSelect}>
                Division
                <select value={divisionId} onChange={(event) => selectDivision(event.currentTarget.value)} disabled={busy}>
                  {schedule.divisions.map((item) => (
                    <option key={item.divisionId} value={item.divisionId}>{item.divisionName}</option>
                  ))}
                </select>
              </label>
              <div className={styles.actions}>
                {!division?.scheduleLocked && !scheduleGenerated && (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={busy || !canGenerate}
                    onClick={() => division && runAction(
                      () => generateDivisionSchedule(seasonId, division.divisionId),
                      'Schedule generated. Review appointments, then validate the whole schedule.',
                    )}
                  >
                    {busy ? 'Generating schedule…' : 'Generate Schedule'}
                  </button>
                )}
                {!division?.scheduleLocked && scheduleGenerated && (
                  <>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={reviewSchedule}
                    >
                      Review Schedule
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={busy}
                      onClick={validateSchedule}
                    >
                      {busy ? 'Validating…' : 'Validate Schedule'}
                    </button>
                    {scheduleValid && (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={busy}
                        onClick={() => division && runAction(
                          () => lockDivisionSchedule(seasonId, division.divisionId),
                          'Schedule locked.',
                        )}
                      >
                        Lock Schedule
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>

            {division && (
              <>
                <section className={styles.workflow} aria-label="Schedule workflow status">
                  <div><span>Fixture Generation</span><strong>{division.generationStatus === 'GENERATED' ? 'Generated' : label(division.generationStatus)}</strong></div>
                  <div>
                    <span>Schedule</span>
                    <strong>
                      {division.scheduleLocked
                        ? 'Locked'
                        : !scheduleGenerated
                          ? 'Not Generated'
                          : division.scheduleValidationRequired
                            ? 'Requires Validation'
                            : scheduleValid
                              ? 'Valid'
                              : 'Generated'}
                    </strong>
                  </div>
                  {scheduleGenerated && (
                    <>
                      <div><span>Scheduled</span><strong>{division.scheduledFixtureCount}</strong></div>
                      <div><span>Unscheduled</span><strong>{division.unscheduledFixtureCount}</strong></div>
                    </>
                  )}
                  {scheduleValid && (
                    <>
                      <div><span>Errors</span><strong>{validationReport?.summary.errors ?? 0}</strong></div>
                      <div><span>Conflicts</span><strong>{currentConflictCount ?? 0}</strong></div>
                      <div><span>Warnings</span><strong>{validationReport?.summary.warnings ?? division.warnings.length}</strong></div>
                    </>
                  )}
                </section>
                <section className={styles.summary} aria-label="Schedule summary">
                  <div><span>Format</span><strong>{label(division.format)}</strong></div>
                  <div><span>Participants</span><strong>{division.participantCount}</strong></div>
                  <div><span>Total fixtures</span><strong>{division.currentFixtureCount} / {division.expectedFixtureCount}</strong></div>
                  <div><span>Scheduled</span><strong>{division.scheduledFixtureCount}</strong></div>
                  <div><span>Unscheduled</span><strong>{division.unscheduledFixtureCount}</strong></div>
                  <div><span>Current round</span><strong>{division.currentRound ?? '—'}</strong></div>
                  <div><span>Scheduling status</span><strong>{division.scheduleLocked ? 'Locked' : division.scheduleValidationRequired ? 'Requires validation' : scheduleValid ? 'Valid' : scheduleGenerated ? 'Generated' : 'Not generated'}</strong></div>
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
                {validationReport && (
                  <section className={validationReport.valid ? styles.noticeWarning : styles.noticeError} aria-label="Latest schedule validation">
                    <h3>{validationReport.valid ? 'Schedule validated' : 'Schedule validation failed'}</h3>
                    <p>
                      {validationReport.summary.scheduled}/{validationReport.summary.fixtures} scheduled ·{' '}
                      {validationReport.summary.errors} errors ·{' '}
                      {validationReport.summary.conflicts} conflicts ·{' '}
                      {validationReport.summary.warnings} warning(s)
                    </p>
                    {validationReport.errors.length > 0 && <ul>{validationReport.errors.map((item) => <li key={item}>{item}</li>)}</ul>}
                    {validationReport.warnings.length > 0 && <ul>{validationReport.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}
                  </section>
                )}
                {message && division && (
                  <section className={messageIsError ? styles.noticeError : styles.message} role={messageIsError ? 'alert' : 'status'}>
                    <p>{message}</p>
                    {messageIsError && <button type="button" className={styles.rowButton} disabled={busy} onClick={retryLoad}>Retry</button>}
                  </section>
                )}

                <section className={styles.fixtureSection} id="fixture-list">
                  <header className={styles.sectionHeader}>
                    <div><p className={styles.eyebrow}>Division fixtures</p><h3>{division.divisionName}</h3></div>
                    <span>{fixturePage?.pagination.total ?? 0} fixtures</span>
                  </header>
                  {fixturesLoading ? (
                    <div className={styles.emptyState} role="status">Loading fixtures…</div>
                  ) : fixturePage === null && messageIsError ? (
                    <div className={styles.emptyState}>
                      <h3>Fixtures could not be loaded</h3>
                      <p>{message}</p>
                      <button type="button" className={styles.rowButton} disabled={busy} onClick={retryLoad}>Retry loading fixtures</button>
                    </div>
                  ) : fixtures.length === 0 ? (
                    <div className={styles.emptyState}>
                      <h3>{division.generationStatus === 'NOT_GENERATED' ? 'No fixtures generated' : 'No fixtures to display'}</h3>
                      <p>{division.generationStatus === 'NOT_GENERATED' ? 'Generate the complete selected competition format to begin scheduling.' : 'Resolve the listed blockers before generating this schedule.'}</p>
                    </div>
                  ) : (
                    <>
                      <div className={styles.tableWrap}>
                        <table>
                          <thead><tr>
                            <th>Fixture</th>
                            <th>Round</th>
                            <th>Home player</th>
                            <th>Away player</th>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Timezone</th>
                            <th>Check-in window</th>
                            <th>Play window</th>
                            <th>Scheduling status</th>
                            <th>Match status</th>
                            <th>Adjustment</th>
                          </tr></thead>
                          <tbody>
                            {fixtures.map((fixture) => {
                              const canAdjust = scheduleGenerated && schedule.seasonStatus === 'ROSTER_LOCKED' &&
                                !division.scheduleLocked && fixture.matchStatus === 'SCHEDULED';
                              const draft = getDraft(fixture);
                              return (
                                <tr key={fixture.id}>
                                  <td>#{fixture.fixtureNumber ?? '—'}</td>
                                  <td>{fixture.roundNumber ?? '—'}</td>
                                  <td>{fixture.homePlayer.gamerTag}</td>
                                  <td>{fixture.awayPlayer.gamerTag}</td>
                                  <td>{formatDate(fixture.scheduledAt, fixture.timezone)}</td>
                                  <td>{formatTime(fixture.scheduledAt, fixture.timezone)}</td>
                                  <td>{fixture.timezone ?? '—'}</td>
                                  <td>{fixture.checkInOpensAt
                                    ? `${formatTime(fixture.checkInOpensAt, fixture.timezone)} – ${formatTime(fixture.checkInClosesAt, fixture.timezone)}`
                                    : '—'}</td>
                                  <td>{fixture.playWindowOpensAt
                                    ? `${formatTime(fixture.playWindowOpensAt, fixture.timezone)} – ${formatTime(fixture.playWindowClosesAt, fixture.timezone)}`
                                    : '—'}</td>
                                  <td>{label(fixture.schedulingStatus)}</td>
                                  <td>{label(fixture.matchStatus ?? fixture.status)}</td>
                                  <td>
                                    {canAdjust && fixture.scheduledAt ? (
                                      <details className={styles.appointmentDetails}>
                                        <summary>Adjust</summary>
                                        <div className={styles.appointmentFields}>
                                          <label>Appointment<input type="datetime-local" value={draft.scheduledAt} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'scheduledAt', event.currentTarget.value)} /></label>
                                          <label>Check-in opens<input type="datetime-local" value={draft.checkInOpensAt} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'checkInOpensAt', event.currentTarget.value)} /></label>
                                          <label>Check-in closes<input type="datetime-local" value={draft.checkInClosesAt} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'checkInClosesAt', event.currentTarget.value)} /></label>
                                          <label>Play window opens<input type="datetime-local" value={draft.playWindowOpensAt} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'playWindowOpensAt', event.currentTarget.value)} /></label>
                                          <label>Play window closes<input type="datetime-local" value={draft.playWindowClosesAt} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'playWindowClosesAt', event.currentTarget.value)} /></label>
                                          <label>Timezone<input type="text" value={draft.timezone} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'timezone', event.currentTarget.value)} /></label>
                                          <label>Adjustment reason (optional)<input type="text" value={draft.reason} disabled={busy} onChange={(event) => setAppointmentField(fixture, 'reason', event.currentTarget.value)} /></label>
                                          <button type="button" className={styles.rowButton} disabled={busy} onClick={() => saveSchedule(fixture)}>
                                            Save adjustment
                                          </button>
                                        </div>
                                      </details>
                                    ) : division.scheduleLocked ? 'Locked' : '—'}
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
                          <button type="button" className={styles.rowButton} disabled={busy || fixturesLoading || page <= 1} onClick={() => goToPage(page - 1)}>Previous</button>
                          <button type="button" className={styles.rowButton} disabled={busy || fixturesLoading || page >= (fixturePage?.pagination.totalPages ?? 1)} onClick={() => goToPage(page + 1)}>Next</button>
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