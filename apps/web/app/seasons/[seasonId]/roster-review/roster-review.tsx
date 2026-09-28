'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  getSeasonOverview,
  lockSeasonRoster,
  listAdminParticipants,
  SeasonOverview,
  updateAdminParticipant,
} from '../../../lib/api-client';
import styles from './roster-review.module.css';

type Props = {
  seasonId: string;
  initialOverview: SeasonOverview;
  initialParticipants: Array<{
    id: string;
    season_id: string;
    division_id: string;
    player_id: string;
    status: string;
    seed?: number | null;
    registered_at: string;
    withdrawn_at?: string | null;
    player: {
      id: string;
      gamer_tag: string;
      user?: {
        id: string;
        email: string;
        username: string;
      };
    };
    division: {
      id: string;
      name: string;
      type: string;
      format: string;
      capacity?: number | null;
      active: boolean;
    };
  }>;
};

const statusColor: Record<string, string> = {
  ACTIVE: '#17633d',
  WITHDRAWN: '#a0522d',
  DISQUALIFIED: '#7b1e1e',
};

export default function RosterReview({
  seasonId,
  initialOverview,
  initialParticipants,
}: Props) {
  const [overview, setOverview] = useState(initialOverview);
  const [participants, setParticipants] = useState(initialParticipants);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const activeParticipants = useMemo(
    () =>
      participants.filter(
        (participant) => participant.status === 'ACTIVE',
      ),
    [participants],
  );

  const divisions = useMemo(
    () => overview.divisions.filter((division) => division.active),
    [overview],
  );

  async function refresh() {
    const [nextOverview, nextParticipants] = await Promise.all([
      getSeasonOverview(seasonId),
      listAdminParticipants(seasonId),
    ]);

    setOverview(nextOverview);
    setParticipants(nextParticipants);
  }

  async function handleLock() {
    setBusy(true);
    setMessage(null);

    try {
      await lockSeasonRoster(seasonId);
      await refresh();
      setMessage('Roster locked successfully.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to lock roster',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(
    participantId: string,
    status: 'WITHDRAWN' | 'DISQUALIFIED',
  ) {
    setBusy(true);
    setMessage(null);

    try {
      await updateAdminParticipant(seasonId, participantId, {
        status,
        reason: `Admin ${status.toLowerCase()} update during roster review`,
      });

      await refresh();

      setMessage(`Participant updated to ${status}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to update participant',
      );
    } finally {
      setBusy(false);
    }
  }

  const ready = overview.readiness.canAdvance;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Roster review</p>
          <h1 className={styles.headerTitle}>{overview.name}</h1>
        </div>

        <Link
          href={`/seasons/${seasonId}`}
          className={styles.backLink}
        >
          Back to season workspace
        </Link>
      </header>

      <section className={styles.summaryGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>
            Active participants
          </span>
          <strong className={styles.statValue}>
            {activeParticipants.length}
          </strong>
        </div>

        <div className={styles.stat}>
          <span className={styles.statLabel}>Divisions</span>
          <strong className={styles.statValue}>
            {divisions.length}
          </strong>
        </div>

        <div className={styles.stat}>
          <span className={styles.statLabel}>Fixtures</span>
          <strong className={styles.statValue}>
            {overview.counts.fixtures}
          </strong>
        </div>

        <div className={styles.stat}>
          <span className={styles.statLabel}>Ready to lock</span>
          <strong className={styles.statValue}>
            {ready ? 'Yes' : 'No'}
          </strong>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Review checklist</p>
            <h2 className={styles.panelTitle}>
              Roster lock prerequisites
            </h2>
          </div>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleLock}
            disabled={busy || !ready}
          >
            {busy ? 'Locking...' : 'Lock roster'}
          </button>
        </div>

        {overview.readiness.issues.length > 0 ? (
          <ul className={styles.list}>
            {overview.readiness.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.success}>
            The roster is eligible for lock and fixture generation.
          </p>
        )}

        {message && (
          <p className={styles.message}>
            {message}
          </p>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Participant queue</p>
            <h2 className={styles.panelTitle}>
              Review active roster
            </h2>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.tableHeader}>Player</th>
                <th className={styles.tableHeader}>Division</th>
                <th className={styles.tableHeader}>Seed</th>
                <th className={styles.tableHeader}>Status</th>
                <th className={styles.tableHeader}>Action</th>
              </tr>
            </thead>

            <tbody>
              {participants.map((participant) => {
                const color =
                  statusColor[participant.status] ?? '#4b5563';

                return (
                  <tr key={participant.id}>
                    <td className={styles.tableCell}>
                      <strong>
                        {participant.player.gamer_tag}
                      </strong>
                    </td>

                    <td className={styles.tableCell}>
                      {participant.division.name}
                    </td>

                    <td className={styles.tableCell}>
                      {participant.seed ?? '—'}
                    </td>

                    <td className={styles.tableCell}>
                      <span
                        className={styles.statusBadge}
                        style={{
                          background: `${color}20`,
                          color,
                        }}
                      >
                        {participant.status}
                      </span>
                    </td>

                    <td className={styles.tableCell}>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() =>
                            handleStatus(
                              participant.id,
                              'WITHDRAWN',
                            )
                          }
                          disabled={
                            busy ||
                            participant.status !== 'ACTIVE'
                          }
                        >
                          Withdraw
                        </button>

                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() =>
                            handleStatus(
                              participant.id,
                              'DISQUALIFIED',
                            )
                          }
                          disabled={
                            busy ||
                            participant.status !== 'ACTIVE'
                          }
                        >
                          Disqualify
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
