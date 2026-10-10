'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PageShell from '../../../../components/page-shell';
import {
  completeCompetitionGame,
  completeCompetitionSeries,
  getSeriesExecutionWorkspace,
  overrideCompetitionGameResult,
  startCompetitionGame,
  updateCompetitionGameScore,
  verifyCompetitionGameResult,
} from '../../../../lib/api-client';
import type { SeriesExecutionWorkspace } from '../../../../lib/api-client';
import styles from './execution-workspace.module.css';

type Props = {
  seasonId: string;
  seriesId: string;
  initialWorkspace: SeriesExecutionWorkspace | null;
  loadError?: string;
};

type ResultChoice = 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' | 'UNRESOLVED';
type ScoreDraft = { home: number; away: number };

function formatDateTime(value: string | null, timezone: string) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

function formatRemaining(milliseconds: number | null) {
  if (milliseconds === null) return 'Not active';
  const seconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function SeriesExecutionWorkspacePage({ seasonId, seriesId, initialWorkspace, loadError }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(loadError ?? '');
  const [isError, setIsError] = useState(Boolean(loadError));
  const [elapsedMs, setElapsedMs] = useState(0);
  const [scores, setScores] = useState<Record<string, ScoreDraft>>({});
  const [results, setResults] = useState<Record<string, ResultChoice>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [verificationReasons, setVerificationReasons] = useState<Record<string, string>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [overrideEvidence, setOverrideEvidence] = useState<Record<string, string>>({});
  const [overrideReferences, setOverrideReferences] = useState<Record<string, string>>({});
  const remainingMsAtRefresh = workspace?.matchWindow.remainingMs;

  useEffect(() => {
    if (remainingMsAtRefresh === null || remainingMsAtRefresh === undefined) return;
    const timer = window.setInterval(() => setElapsedMs((elapsed) => elapsed + 1000), 1000);
    return () => window.clearInterval(timer);
  }, [remainingMsAtRefresh]);

  async function refresh() {
    const updated = await getSeriesExecutionWorkspace(seriesId);
    setWorkspace(updated);
    setElapsedMs(0);
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setMessage('');
    setIsError(false);
    try {
      await action();
      await refresh();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The Series operation could not be completed.');
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) {
    return <PageShell title="Series Execution" subtitle="Competition operations">
      <main className={styles.page}>
        <p className={styles.error} role="alert">{message || 'Series execution data is unavailable.'}</p>
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => refresh().catch((error) => {
          setMessage(error instanceof Error ? error.message : 'Unable to reload Series data.');
          setIsError(true);
        })}>Retry</button>
      </main>
    </PageShell>;
  }

  const { series, matchWindow, participants, games } = workspace;
  const remainingMs = matchWindow.remainingMs === null ? null : Math.max(0, matchWindow.remainingMs - elapsedMs);

  return <PageShell title="Series Execution" subtitle={`${workspace.season.name} · Phase ${workspace.phase.number}`}>
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href={`/seasons/${seasonId}/schedule`} className={styles.backLink}>Competition workspace</Link>
          <p className={styles.eyebrow}>{workspace.phase.name} · {workspace.plot.name}</p>
          <h2>Series {series.number ?? '—'}</h2>
          <p className={styles.participantLine}>{participants.map((player) => player.gamerTag).join(' vs ') || 'Participants unavailable'}</p>
        </div>
        <div className={styles.statusBlock}>
          <span>Series state</span>
          <strong>{series.status.replaceAll('_', ' ')}</strong>
          <small>Result · {series.resultState.replaceAll('_', ' ')}</small>
        </div>
      </header>

      <section className={styles.timing} aria-label="Match timing and attendance">
        <div><span>Match Window</span><strong>{formatDateTime(matchWindow.startsAt, matchWindow.timezone)}</strong><small>{matchWindow.timezone} · {matchWindow.state.replaceAll('_', ' ')}</small></div>
        <div><span>Time remaining</span><strong className={styles.clock}>{formatRemaining(remainingMs)}</strong><small>Server time {formatDateTime(workspace.serverTime, matchWindow.timezone)}</small></div>
        <div><span>Check-in</span><strong>{workspace.checkIn.checkedInCount}/{workspace.checkIn.requiredCount} present</strong><small>{workspace.checkIn.state.replaceAll('_', ' ')} · results {matchWindow.resultSubmissionState.replaceAll('_', ' ')}</small></div>
        <div><span>Series score</span><strong>{workspace.seriesScore ? `${workspace.seriesScore.homeWins} – ${workspace.seriesScore.awayWins}` : '—'}</strong><small>{series.winnerGamerTag ? `Advances ${series.winnerGamerTag}` : 'Advancement pending'}</small></div>
      </section>

      {message && <p className={isError ? styles.error : styles.notice} role={isError ? 'alert' : 'status'}>{message}</p>}

      <section className={styles.players} aria-label="Series participants">
        {participants.map((player) => <div className={styles.player} key={player.id}>
          <div><span>Participant</span><strong>{player.gamerTag}</strong></div>
          <span className={player.checkedIn ? styles.present : styles.absent}>{player.checkedIn ? 'Checked in' : 'Not checked in'}</span>
        </div>)}
      </section>

      <section className={styles.games} aria-label="Series Games">
        <header className={styles.sectionHeader}>
          <div><p className={styles.eyebrow}>Best of three</p><h3>Games</h3></div>
          <span>{games.filter((game) => game.status === 'COMPLETED').length}/3 resolved</span>
        </header>
        {games.map((game) => {
          const draft = scores[game.id] ?? { home: game.homeScore, away: game.awayScore };
          const result = results[game.id] ?? (game.result === 'HOME_WIN' || game.result === 'AWAY_WIN' || game.result === 'DRAW' || game.result === 'UNRESOLVED'
            ? game.result
            : 'HOME_WIN');
          const gameReason = reasons[game.id] ?? '';
          const verificationReason = verificationReasons[game.id] ?? '';
          const overrideReason = overrideReasons[game.id] ?? '';
          const overrideEvidenceUrl = overrideEvidence[game.id] ?? '';
          const overrideReference = overrideReferences[game.id] ?? '';
          const homeName = game.homeGamerTag ?? 'Home participant';
          const awayName = game.awayGamerTag ?? 'Away participant';
          return <article className={styles.game} key={game.id}>
            <header className={styles.gameHeader}>
              <div><p className={styles.eyebrow}>Game {game.number}</p><h4>{homeName} <span>vs</span> {awayName}</h4></div>
              <span className={game.status === 'IN_PROGRESS' ? styles.active : styles.gameStatus}>{game.status.replaceAll('_', ' ')}</span>
            </header>
            <div className={styles.scoreboard}>
              <div><span>{homeName}</span><strong>{game.homeScore}</strong></div>
              <b>–</b>
              <div><span>{awayName}</span><strong>{game.awayScore}</strong></div>
            </div>
            {game.result && <p className={styles.resultLine}>Result · {game.result.replaceAll('_', ' ')} · Verification {game.verificationStatus.replaceAll('_', ' ')}{game.winnerPlayerId ? ` · Winner ${game.winnerPlayerId === game.homePlayerId ? homeName : awayName}` : ''}{game.verificationReason ? ` · ${game.verificationReason}` : ''}</p>}
            {game.status === 'PENDING' && <button type="button" className={styles.primaryButton} disabled={busy || !game.canStart} onClick={() => runAction(() => startCompetitionGame(seriesId, game.id), `Game ${game.number} started.`)}>Start Game {game.number}</button>}
            {game.canUpdateScore && <div className={styles.controls}>
              <label>{homeName}<input type="number" min={0} step={1} value={draft.home} disabled={busy} onChange={(event) => setScores((current) => ({ ...current, [game.id]: { ...draft, home: Number(event.currentTarget.value) } }))} /></label>
              <label>{awayName}<input type="number" min={0} step={1} value={draft.away} disabled={busy} onChange={(event) => setScores((current) => ({ ...current, [game.id]: { ...draft, away: Number(event.currentTarget.value) } }))} /></label>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => runAction(
                () => updateCompetitionGameScore(seriesId, game.id, { homeScore: draft.home, awayScore: draft.away }),
                `Game ${game.number} score saved.`,
              )}>Save score</button>
            </div>}
            {game.canRecordResult && <div className={styles.resultForm}>
              <label>Result<select value={result} disabled={busy} onChange={(event) => setResults((current) => ({ ...current, [game.id]: event.currentTarget.value as ResultChoice }))}>
                <option value="HOME_WIN">Home win</option><option value="AWAY_WIN">Away win</option><option value="DRAW">Draw</option><option value="UNRESOLVED">Unresolved</option>
              </select></label>
              {result === 'UNRESOLVED' && <label>Reason<input type="text" maxLength={500} value={gameReason} disabled={busy} onChange={(event) => setReasons((current) => ({ ...current, [game.id]: event.currentTarget.value }))} /></label>}
              <button type="button" className={styles.primaryButton} disabled={busy || (result === 'UNRESOLVED' && !gameReason.trim())} onClick={() => runAction(
                () => completeCompetitionGame(seriesId, game.id, {
                  result,
                  homeScore: game.homeScore,
                  awayScore: game.awayScore,
                  reason: gameReason || undefined,
                }),
                `Game ${game.number} result recorded.`,
              )}>Record result</button>
            </div>}
            {game.canVerifyResult && <div className={styles.verificationForm}>
              <strong>Verify submitted result</strong>
              <label>Reason for rejection or correction<input type="text" maxLength={500} value={verificationReason} disabled={busy} onChange={(event) => setVerificationReasons((current) => ({ ...current, [game.id]: event.currentTarget.value }))} /></label>
              <div className={styles.verificationActions}>
                <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => runAction(
                  () => verifyCompetitionGameResult(seriesId, game.id, { status: 'APPROVED' }),
                  `Game ${game.number} result approved.`,
                )}>Approve result</button>
                <button type="button" className={styles.secondaryButton} disabled={busy || !verificationReason.trim()} onClick={() => runAction(
                  () => verifyCompetitionGameResult(seriesId, game.id, { status: 'REJECTED', reason: verificationReason }),
                  `Game ${game.number} result rejected; correction is open.`,
                )}>Reject</button>
                <button type="button" className={styles.secondaryButton} disabled={busy || !verificationReason.trim()} onClick={() => runAction(
                  () => verifyCompetitionGameResult(seriesId, game.id, { status: 'CORRECTION_REQUESTED', reason: verificationReason }),
                  `Correction requested for Game ${game.number}.`,
                )}>Request correction</button>
              </div>
            </div>}
            {game.canOverrideResult && <details className={styles.overrideForm}>
              <summary>Override result</summary>
              <p className={styles.overrideConsequences}>Use only to correct a completed Game result. This creates a new audited result version and recalculates the Series score. It does not bypass Phase schedule locks, Series state, or Season dates.</p>
              <label>Correct result<select value={result} disabled={busy} onChange={(event) => setResults((current) => ({ ...current, [game.id]: event.currentTarget.value as ResultChoice }))}>
                <option value="HOME_WIN">Home win</option><option value="AWAY_WIN">Away win</option><option value="DRAW">Draw</option><option value="UNRESOLVED">Unresolved</option>
              </select></label>
              <label>Reason<input type="text" maxLength={500} value={overrideReason} disabled={busy} onChange={(event) => setOverrideReasons((current) => ({ ...current, [game.id]: event.currentTarget.value }))} /></label>
              <label>Supporting evidence URL (optional)<input type="url" maxLength={2048} value={overrideEvidenceUrl} disabled={busy} onChange={(event) => setOverrideEvidence((current) => ({ ...current, [game.id]: event.currentTarget.value }))} /></label>
              <label>Reference (optional)<input type="text" maxLength={128} value={overrideReference} disabled={busy} onChange={(event) => setOverrideReferences((current) => ({ ...current, [game.id]: event.currentTarget.value }))} /></label>
              <button type="button" className={styles.secondaryButton} disabled={busy || !overrideReason.trim() || (result === 'UNRESOLVED' && !overrideReason.trim())} onClick={() => runAction(
                () => overrideCompetitionGameResult(seriesId, game.id, {
                  result,
                  homeScore: game.homeScore,
                  awayScore: game.awayScore,
                  reason: overrideReason,
                  evidenceUrl: overrideEvidenceUrl.trim() || undefined,
                  reference: overrideReference.trim() || undefined,
                }),
                `Game ${game.number} result overridden.`,
              )}>Apply override</button>
            </details>}
          </article>;
        })}
      </section>

      <footer className={styles.footer}>
        <div><strong>Series completion</strong><span>{series.canComplete ? 'All three Games have resolved.' : 'All three Games must resolve before the Series can complete.'}</span></div>
        <button type="button" className={styles.primaryButton} disabled={busy || !series.canComplete} onClick={() => runAction(
          () => completeCompetitionSeries(seriesId),
          'Series result and advancement finalized.',
        )}>Complete Series</button>
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => refresh().catch((error) => {
          setMessage(error instanceof Error ? error.message : 'Unable to refresh Series data.');
          setIsError(true);
        })}>Refresh</button>
      </footer>
    </main>
  </PageShell>;
}
