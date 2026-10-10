'use client';

import Link from 'next/link';
import { useState } from 'react';
import PageShell from '../../../components/page-shell';
import {
  adjustCompetitionSeriesSchedule,
  generateCompetitionSchedule,
  getCompetitionWorkspace,
  lockCompetitionSchedule,
  recordCompetitionSeriesCheckIn,
  startCompetitionSeries,
  validateCompetitionSchedule,
} from '../../../lib/api-client';
import type { CompetitionWorkspace } from '../../../lib/api-client';
import styles from './competition-workspace.module.css';

type Props = {
  seasonId: string;
  initialWorkspace: CompetitionWorkspace | null;
  loadError?: string;
};

function formatDate(value: string | null, timezone: string) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: timezone }).format(new Date(value));
}

function formatDateTime(value: string | null, timezone: string) {
  if (!value) return 'Unscheduled';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

function toLocalDateTime(value: string | null, timezone: string) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function timezoneOffsetAt(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second')) - instant.getTime();
}

function localDateTimeToIso(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Choose a valid date and time.');
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const wallClockAsUtc = Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), Number(hourText), Number(minuteText));
  const offsets = [-36, -24, -12, 0, 12, 24, 36].map((offset) =>
    timezoneOffsetAt(new Date(wallClockAsUtc + offset * 60 * 60 * 1000), timezone));
  const candidate = [...new Set(offsets)]
    .map((offset) => wallClockAsUtc - offset)
    .find((instant) => toLocalDateTime(new Date(instant).toISOString(), timezone) === value);
  if (candidate === undefined) throw new Error('That local time does not exist in the competition timezone.');
  return new Date(candidate).toISOString();
}

function stepStatus(step: string, workspace: CompetitionWorkspace, selectedPhaseId: string) {
  const phase = workspace.phases.find((item) => item.id === selectedPhaseId);
  if (!phase) return 'waiting';
  const hasSchedule = phase.seriesCount > 0 && phase.scheduleStatus !== 'NOT_SCHEDULED';
  if (step === 'Generate') return hasSchedule ? 'done' : 'current';
  if (step === 'Review') return hasSchedule ? 'done' : 'waiting';
  if (step === 'Adjust') return phase.scheduleLocked ? 'done' : hasSchedule ? 'current' : 'waiting';
  if (step === 'Validate') return workspace.validation.valid && hasSchedule ? 'done' : hasSchedule ? 'current' : 'waiting';
  if (step === 'Lock') return phase.scheduleLocked ? 'done' : workspace.validation.canLock && hasSchedule ? 'current' : 'waiting';
  if (step === 'Execute') return phase.status === 'ACTIVE' ? 'done' : phase.scheduleLocked ? 'current' : 'waiting';
  if (step === 'Resolve') return phase.advancementStatus === 'FINALIZED' ? 'done' : phase.status === 'ACTIVE' ? 'current' : 'waiting';
  return phase.advancementStatus === 'FINALIZED' && phase.status === 'COMPLETED' ? 'done' : 'waiting';
}

export default function CompetitionWorkspace({ seasonId, initialWorkspace, loadError }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [selectedPhaseId, setSelectedPhaseId] = useState(initialWorkspace?.currentPhaseId ?? initialWorkspace?.phases[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(loadError ?? '');
  const [messageIsError, setMessageIsError] = useState(Boolean(loadError));
  const [adjustment, setAdjustment] = useState<Record<string, { localStart: string; reason: string }>>({});
  const [checkInExceptionReasons, setCheckInExceptionReasons] = useState<Record<string, string>>({});

  const phase = workspace?.phases.find((item) => item.id === selectedPhaseId) ?? null;
  const scheduleGenerated = Boolean(phase && phase.seriesCount > 0 && phase.scheduleStatus !== 'NOT_SCHEDULED');
  const canGenerate = Boolean(phase && phase.seriesCount > 0 && !phase.scheduleLocked && !busy);
  const canLock = Boolean(phase && !phase.scheduleLocked && phase.validation.valid && workspace?.validation.canLock && scheduleGenerated && !busy);
  const plotCount = phase?.plots.length ?? 0;
  const timezone = workspace?.season.timezone ?? 'UTC';
  const scheduleLocked = Boolean(phase?.scheduleLocked);
  const steps = ['Generate', 'Review', 'Adjust', 'Validate', 'Lock', 'Execute', 'Resolve', 'Advance'];

  const seriesCountByStatus = {
    completed: phase?.completedSeriesCount ?? 0,
    pending: phase?.pendingSeriesCount ?? 0,
  };

  async function refresh() {
    const updated = await getCompetitionWorkspace(seasonId);
    setWorkspace(updated);
    setSelectedPhaseId((current) => updated.phases.some((item) => item.id === current)
      ? current
      : updated.currentPhaseId ?? updated.phases[0]?.id ?? '');
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage('');
    setMessageIsError(false);
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The competition action could not be completed.');
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveAdjustment(seriesId: string, timezone: string) {
    const draft = adjustment[seriesId];
    if (!draft?.localStart) {
      setMessage('Choose a new Series Match Window start.');
      setMessageIsError(true);
      return;
    }
    let matchWindowStartAt: string;
    try {
      matchWindowStartAt = localDateTimeToIso(draft.localStart, timezone);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Enter a valid local appointment time.');
      setMessageIsError(true);
      return;
    }
    await runAction(
      () => adjustCompetitionSeriesSchedule(seriesId, { matchWindowStartAt, reason: draft.reason || undefined }),
      'Series appointment adjusted and the schedule revalidated.',
    );
  }

  async function validateSchedule() {
    setBusy(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const report = await validateCompetitionSchedule(seasonId);
      await refresh();
      setMessage(report.valid
        ? 'All Phase schedules validated and ready to lock.'
        : `Validation found ${report.errors.length} hard blocker(s). Review the affected Series below.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Schedule validation failed.');
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) {
    return (
      <PageShell title="Competition Workspace" subtitle="Season operations">
        <div className={styles.emptyState}>
          <h2>Competition data unavailable</h2>
          <p>{message || 'The canonical Phase, Plot, and Series workspace could not be loaded.'}</p>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => refresh().catch((error) => {
            setMessage(error instanceof Error ? error.message : 'Unable to reload competition data.');
            setMessageIsError(true);
          })}>Retry</button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Competition Workspace" subtitle={`${workspace.season.leagueName} · ${workspace.season.name}`}>
      <main className={styles.page}>
        <header className={styles.seasonHeader}>
          <div><Link href={`/seasons/${seasonId}`} className={styles.backLink}>Season workspace</Link><p className={styles.eyebrow}>Phase operations</p><h2>{workspace.season.name}</h2><p>{workspace.season.leagueName} · {workspace.season.status.replaceAll('_', ' ')}</p></div>
          <div className={styles.seasonTiming}><span>Season window</span><strong>{formatDate(workspace.season.startAt, timezone)} – {formatDate(workspace.season.endAt, timezone)}</strong><small>{timezone}</small></div>
        </header>
        <section className={styles.workflow} aria-label="Competition workflow">
          {steps.map((step, index) => {
            const status = stepStatus(step, workspace, selectedPhaseId);
            return <div className={`${styles.workflowStep} ${styles[status]}`} key={step} aria-current={status === 'current' ? 'step' : undefined}><span className={styles.stepNumber}>{index + 1}</span><span>{step}</span></div>;
          })}
        </section>
        <section className={styles.actionBar} aria-label="Schedule actions">
          <div className={styles.actionContext}><span className={scheduleLocked ? styles.lockedState : styles.openState}>{scheduleLocked ? 'Phase schedule locked' : 'Phase schedule open'}</span><span>{phase?.name ?? 'No Phase selected'} · {phase?.scheduleStatus.replaceAll('_', ' ') ?? 'No schedule'}</span></div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => refresh().catch((error) => {
              setMessage(error instanceof Error ? error.message : 'Unable to refresh attendance.');
              setMessageIsError(true);
            })}>Refresh attendance</button>
            <button type="button" className={styles.primaryButton} disabled={!phase || phase.seriesCount === 0 || scheduleLocked || busy} onClick={() => runAction(() => generateCompetitionSchedule(seasonId), 'Series schedule generated. Review, validate, then lock.')}>{busy ? 'Working…' : 'Generate schedule'}</button>
            <button type="button" className={styles.secondaryButton} disabled={!scheduleGenerated || busy} onClick={validateSchedule}>Validate</button>
            <button type="button" className={styles.primaryButton} disabled={!canLock} onClick={() => runAction(() => lockCompetitionSchedule(seasonId), 'Schedule locked. Appointment changes are now read-only.')}>Lock schedule</button>
          </div>
        </section>
        {message && <p className={messageIsError ? styles.errorMessage : styles.successMessage} role={messageIsError ? 'alert' : 'status'}>{message}</p>}
        <section className={styles.metrics} aria-label="Season competition summary">
          <div><span>Phases</span><strong>{workspace.summary.phaseCount}</strong></div><div><span>Plots</span><strong>{workspace.summary.plotCount}</strong></div><div><span>Participants</span><strong>{workspace.summary.participantCount}</strong></div><div><span>Series</span><strong>{workspace.summary.seriesCount}</strong></div><div><span>Completed / pending</span><strong>{workspace.summary.completedSeriesCount} / {workspace.summary.pendingSeriesCount}</strong></div><div><span>Unresolved Series</span><strong className={workspace.summary.unresolvedSeriesCount > 0 ? styles.bad : styles.good}>{workspace.summary.unresolvedSeriesCount}</strong></div><div><span>Games complete</span><strong>{workspace.summary.completedGameCount} / {workspace.summary.gameCount}</strong></div><div><span>Conflicts</span><strong>{workspace.summary.conflictCount}</strong></div><div><span>Validation</span><strong className={workspace.validation.valid ? styles.good : styles.bad}>{workspace.validation.valid ? 'Valid' : `${workspace.validation.errors.length} blockers`}</strong></div>
        </section>
        {workspace.capacity && <section className={styles.capacity} aria-label="Remaining Season capacity">
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Season capacity</p><h3>{workspace.capacity.feasible ? 'Workload fits current Season window' : 'Generation blocked by remaining capacity'}</h3></div><span>{workspace.capacity.feasible ? 'Feasible' : 'Infeasible'}</span></div>
          <p>Final Phase protected from {formatDate(workspace.capacity.protectedFinalWeekStartAt, timezone)} · {workspace.capacity.phases.reduce((sum, item) => sum + item.seriesCount, 0)} remaining Series · {Math.round(workspace.capacity.phases.reduce((sum, item) => sum + item.durationMs, 0) / 3_600_000)} scheduled hours</p>
          {workspace.capacity.blockers.length > 0 && <ul>{workspace.capacity.blockers.map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>)}</ul>}
        </section>}
        <nav className={styles.phaseNav} aria-label="Competition Phases">
          {workspace.phases.map((item) => <button type="button" key={item.id} className={item.id === selectedPhaseId ? styles.phaseSelected : styles.phaseButton} onClick={() => setSelectedPhaseId(item.id)}><span>{item.id === workspace.currentPhaseId ? 'Current · ' : ''}Phase {item.number}</span><small>{item.status.replaceAll('_', ' ')}</small><small>{item.progression.playedSeriesCount}/{item.seriesCount} Series · {item.progression.phaseFinalized ? `${item.progression.survivors.length} survivors` : `${item.progression.pendingSeriesCount} pending`}</small></button>)}
        </nav>
        {!phase ? <section className={styles.emptyState}><h2>No canonical Phases yet</h2><p>Phase, Plot, and Series generation must complete before a schedule can be reviewed here.</p></section> : <>
          <section className={styles.phaseSummary}>
            <div className={styles.phaseHeading}><div><p className={styles.eyebrow}>{phase.id === workspace.currentPhaseId ? 'Current Phase · ' : ''}{phase.type.replaceAll('_', ' ')}</p><h2>{phase.name}</h2></div><span className={scheduleLocked ? styles.lockedState : styles.openState}>{phase.status.replaceAll('_', ' ')}</span></div>
            <div className={styles.phaseFacts}><div><span>Phase dates</span><strong>{formatDate(phase.startAt, timezone)} – {formatDate(phase.endAt, timezone)}</strong></div><div><span>Plots / participants</span><strong>{plotCount} / {phase.participantCount}</strong></div><div><span>Series complete</span><strong>{seriesCountByStatus.completed} / {phase.seriesCount}</strong></div><div><span>Games complete</span><strong>{phase.completedGameCount} / {phase.gameCount}</strong></div><div><span>Advancement</span><strong>{phase.advancementStatus}</strong></div><div><span>Schedule</span><strong>{phase.scheduleStatus.replaceAll('_', ' ')}</strong></div></div>
          </section>
          <section className={styles.progression} aria-label="Phase progression results">
            <header className={styles.progressionHeader}>
              <div><p className={styles.eyebrow}>Phase results</p><h3>Progression</h3></div>
              <div className={styles.progressionTotals}>
                <span>{phase.progression.playedSeriesCount} Series played</span>
                <span>{phase.progression.gamesPlayedCount} Games played</span>
                <span>{phase.progression.phaseFinalized ? `${phase.progression.survivors.length} survivors` : 'Phase pending'}</span>
              </div>
            </header>
            <div className={styles.progressionTableWrap}>
              <table className={styles.progressionTable}>
                <thead><tr><th>Participant</th><th>Plot</th><th>Series W–L</th><th>Games</th><th>Eliminations</th><th>Phase result</th></tr></thead>
                <tbody>
                  {phase.progression.participants.map((participant) => {
                    const result = participant.advancementEligible
                      ? 'ADVANCEMENT ELIGIBLE'
                      : participant.eliminations > 0
                        ? 'ELIMINATED'
                        : phase.progression.phaseFinalized
                          ? 'NOT ELIGIBLE'
                          : 'PENDING';
                    return <tr key={participant.playerId}>
                      <td><strong>{participant.gamerTag}</strong><small>{participant.playerId.slice(0, 8)}</small></td>
                      <td>{participant.plotNames.join(', ') || 'Unassigned'}</td>
                      <td>{participant.seriesWins}–{participant.seriesLosses}</td>
                      <td>{participant.gamesPlayed}</td>
                      <td>{participant.eliminations}</td>
                      <td><span className={participant.advancementEligible ? styles.eligible : participant.eliminations > 0 ? styles.eliminated : styles.pending}>{result}</span></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {phase.validation.blockers.length > 0 && <section className={styles.blockers} aria-label="Schedule blockers"><h3>Validation blockers</h3><ul>{phase.validation.blockers.map((item, index) => <li key={`${item.seriesId}-${item.code}-${index}`}><strong>{item.seriesId}</strong> · {item.message}</li>)}</ul></section>}
          {workspace.validation.warnings.length > 0 && <section className={styles.warnings} aria-label="Schedule warnings"><h3>Warnings</h3><ul>{workspace.validation.warnings.map((item, index) => <li key={`${item.seriesId}-${index}`}>{item.message}</li>)}</ul></section>}
          <section className={styles.plotList} aria-label="Phase Plots and Series">
            <header className={styles.listHeader}><div><p className={styles.eyebrow}>Phase structure</p><h3>Plots · Series · Games</h3></div><span>{phase.plots.length} plots · {phase.seriesCount} Series</span></header>
            {phase.plots.length === 0 ? <div className={styles.emptyState}><h3>No Plots in this Phase</h3><p>Generate the Phase structure before building its Series schedule.</p></div> : phase.plots.map((plot) => <section className={styles.plot} key={plot.id}>
              <header className={styles.plotHeader}><div><h4>{plot.name}</h4><span>{plot.participantCount} participants · {plot.series.length} Series</span></div><span>{plot.participantIds.map((id) => id.slice(0, 8)).join(' · ') || 'Membership pending'}</span></header>
              {plot.series.length === 0 ? <p className={styles.emptyInline}>No Series generated for this Plot.</p> : <div className={styles.seriesList}>
                {plot.series.map((series) => {
                  const canAdjust = !phase.scheduleLocked && ['DRAFT', 'SCHEDULED'].includes(series.status);
                  const seriesTimezone = series.timezone ?? timezone;
                  const draft = adjustment[series.id] ?? { localStart: toLocalDateTime(series.matchWindowStartAt, seriesTimezone), reason: '' };
                  const exceptionReason = (playerId: string) => checkInExceptionReasons[`${series.id}:${playerId}`] ?? '';
                  return <article className={styles.seriesRow} key={series.id}>
                    <div className={styles.seriesMain}>
                      <div className={styles.seriesIdentity}><strong>Series {series.number ?? '—'}</strong><span>{series.playerIds.map((id) => id.slice(0, 8)).join(' vs ') || 'Participants not assigned'}</span><Link className={styles.executionLink} href={`/seasons/${seasonId}/series/${series.id}`}>Open execution</Link></div>
                      <div className={styles.seriesAppointment}><strong>{formatDateTime(series.matchWindowStartAt, seriesTimezone)}</strong><span>{seriesTimezone} · {series.status.replaceAll('_', ' ')}</span>{series.matchWindowStartAt && <small>Check-in {formatDateTime(series.checkInOpensAt, seriesTimezone)} – {formatDateTime(series.checkInClosesAt, seriesTimezone)} · Results due {formatDateTime(series.resultsDeadlineAt, seriesTimezone)}</small>}</div>
                      <div className={styles.seriesOutcome}><span>{series.games.filter((game) => game.status === 'COMPLETED').length}/3 Games</span><strong>{series.eliminationOutcome?.replaceAll('_', ' ') ?? (series.winnerPlayerId ? `Advances ${series.winnerPlayerId.slice(0, 8)}` : 'Advancement pending')}</strong></div>
                      {canAdjust && <details className={styles.adjustment}><summary>Adjust time</summary>
                        <label>New Match Window start ({seriesTimezone})<input type="datetime-local" value={draft.localStart} disabled={busy} onChange={(event) => setAdjustment((state) => ({ ...state, [series.id]: { ...draft, localStart: event.currentTarget.value } }))} /></label>
                        <label>Reason (optional)<input type="text" value={draft.reason} disabled={busy} onChange={(event) => setAdjustment((state) => ({ ...state, [series.id]: { ...draft, reason: event.currentTarget.value } }))} /></label>
                        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => saveAdjustment(series.id, seriesTimezone)}>Save and revalidate</button>
                      </details>}
                      {phase.scheduleLocked && <span className={styles.readOnly}>Locked</span>}
                    </div>
                    <section className={styles.attendance} aria-label={`Check-in for Series ${series.number ?? ''}`}>
                      <header className={styles.attendanceHeader}>
                        <div><strong>Series check-in</strong><span>{series.checkIn.checkedInCount}/{series.checkIn.participants.length} checked in · {series.checkIn.state.replaceAll('_', ' ')} · {series.checkIn.attendancePolicy.replaceAll('_', ' ')}</span></div>
                        <small>Server time {formatDateTime(workspace.serverTime, timezone)}</small>
                      </header>
                      <div className={styles.attendancePlayers}>
                        {series.checkIn.participants.map((participant) => <div className={styles.attendanceParticipant} key={participant.playerId}>
                          <div className={styles.attendanceIdentity}>
                            <strong>{participant.gamerTag}</strong>
                            <span>{participant.status.replaceAll('_', ' ')}</span>
                            {participant.checkedInAt && <small>{formatDateTime(participant.checkedInAt, timezone)}{participant.isException ? ` · Exception: ${participant.exceptionReason}` : ''}</small>}
                          </div>
                          {!participant.checkedInAt && <div className={styles.attendanceActions}>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              disabled={busy || series.status !== 'SCHEDULED' || series.checkIn.state !== 'OPEN'}
                              onClick={() => runAction(
                                () => recordCompetitionSeriesCheckIn(series.id, participant.playerId),
                                `${participant.gamerTag} checked in.`,
                              )}
                            >Check in</button>
                            {series.checkIn.canManageExceptions && <details className={styles.attendanceException}>
                              <summary>Exception</summary>
                              <p>Only use this to record a verified arrival outside the normal check-in window. It is blocked once the Match Window ends and is saved with your reason in the audit history.</p>
                              <label>Reason<input
                                type="text"
                                maxLength={500}
                                value={exceptionReason(participant.playerId)}
                                disabled={busy}
                                onChange={(event) => setCheckInExceptionReasons((state) => ({
                                  ...state,
                                  [`${series.id}:${participant.playerId}`]: event.currentTarget.value,
                                }))}
                              /></label>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                disabled={busy || !series.checkIn.exceptionAllowed || !exceptionReason(participant.playerId).trim()}
                                onClick={() => runAction(
                                  () => recordCompetitionSeriesCheckIn(series.id, participant.playerId, {
                                    isException: true,
                                    reason: exceptionReason(participant.playerId),
                                  }),
                                  `Exception check-in recorded for ${participant.gamerTag}.`,
                                )}
                              >Record exception</button>
                            </details>}
                          </div>}
                        </div>)}
                      </div>
                      <div className={styles.executionGate}>
                        <span>Execution · {series.execution.status.replaceAll('_', ' ')}</span>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={busy || !series.execution.canStart}
                          onClick={() => runAction(() => startCompetitionSeries(series.id), 'Series started.')}
                        >{series.execution.status === 'IN_PROGRESS' ? 'In progress' : 'Start Series'}</button>
                      </div>
                    </section>
                    <details className={styles.games}><summary>Games ({series.games.length})</summary><div className={styles.gameList}>
                      {series.games.map((game) => <div className={styles.gameRow} key={game.id}><strong>Game {game.number}</strong><span>{game.status.replaceAll('_', ' ')}</span><span>{game.result?.replaceAll('_', ' ') ?? 'Result pending'}</span><span>{game.winnerPlayerId ? `Winner ${game.winnerPlayerId.slice(0, 8)}` : 'No winner'}</span></div>)}
                    </div></details>
                  </article>;
                })}
              </div>}
            </section>)}
          </section>
        </>}
      </main>
    </PageShell>
  );
}