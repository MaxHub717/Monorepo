'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  adminRegisterParticipant,
  bulkAdminRegisterParticipants,
  getSeasonOverview,
  listAdminParticipants,
  SeasonOverview,
  updateAdminParticipant,
} from '../../../lib/api-client';
import styles from './participant-management.module.css';

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

const statusLabels: Record<string, string> = {
  ACTIVE: 'Active',
  WITHDRAWN: 'Withdrawn',
  DISQUALIFIED: 'Disqualified',
};

export default function ParticipantManagement({
  seasonId,
  initialOverview,
  initialParticipants,
}: Props) {
  const [overview, setOverview] = useState(initialOverview);
  const [participants, setParticipants] = useState(initialParticipants);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [playerId, setPlayerId] = useState('');
  const [divisionId, setDivisionId] = useState(
    initialOverview.divisions[0]?.id ?? '',
  );
  const [seed, setSeed] = useState('');
  const [reason, setReason] = useState('');

  const activeDivisions = useMemo(
    () =>
      overview.divisions.filter(
        (division) => division.active,
      ),
    [overview],
  );

  async function refresh() {
    const [freshOverview, freshParticipants] =
      await Promise.all([
        getSeasonOverview(seasonId),
        listAdminParticipants(seasonId),
      ]);

    setOverview(freshOverview);
    setParticipants(freshParticipants);

    if (
      !divisionId ||
      !freshOverview.divisions.some(
        (division) =>
          division.id === divisionId && division.active,
      )
    ) {
      setDivisionId(
        freshOverview.divisions.find(
          (division) => division.active,
        )?.id ?? '',
      );
    }
  }

  function clearForm() {
    setPlayerId('');
    setSeed('');
    setReason('');
  }

  async function handleRegister(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setMessage(null);

    if (!playerId || !divisionId || !reason.trim()) {
      setMessage(
        'Player, division, and reason are required.',
      );
      return;
    }

    setBusy(true);

    try {
      await adminRegisterParticipant(seasonId, {
        playerId,
        divisionId,
        seed: seed ? Number(seed) : undefined,
        reason: reason.trim(),
      });

      clearForm();
      await refresh();

      setMessage('Participant added successfully.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to add participant',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(
    participantId: string,
    nextStatus: 'ACTIVE' | 'WITHDRAWN' | 'DISQUALIFIED',
  ) {
    setBusy(true);
    setMessage(null);

    try {
      await updateAdminParticipant(
        seasonId,
        participantId,
        {
          status: nextStatus,
          reason: `Admin status update to ${nextStatus}`,
        },
      );

      await refresh();

      setMessage(
        `Participant marked ${
          statusLabels[nextStatus] ??
          nextStatus.toLowerCase()
        }.`,
      );
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

  async function handleBulkRegister() {
    if (!playerId || !divisionId || !reason.trim()) {
      setMessage(
        'Choose a player, division, and reason before bulk registration.',
      );
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await bulkAdminRegisterParticipants(seasonId, {
        participants: [
          {
            playerId,
            divisionId,
            seed: seed ? Number(seed) : undefined,
            reason: reason.trim(),
          },
        ],
      });

      clearForm();
      await refresh();

      setMessage('Bulk registration completed.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to bulk register participants',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            Participant management
          </p>
          <h1>{overview.name}</h1>
        </div>

        <Link
          href={`/seasons/${seasonId}`}
          className={styles.backLink}
        >
          Back to season workspace
        </Link>
      </header>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Registration</p>
          <h2>Add participant</h2>
        </div>

        <form
          className={styles.form}
          onSubmit={handleRegister}
        >
          <label>
            Player ID
            <input
              value={playerId}
              onChange={(event) =>
                setPlayerId(event.target.value)
              }
              placeholder="uuid"
            />
          </label>

          <label>
            Division
            <select
              value={divisionId}
              onChange={(event) =>
                setDivisionId(event.target.value)
              }
              disabled={activeDivisions.length === 0}
            >
              {activeDivisions.map((division) => (
                <option
                  key={division.id}
                  value={division.id}
                >
                  {division.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Seed
            <input
              value={seed}
              onChange={(event) =>
                setSeed(event.target.value)
              }
              type="number"
              min="1"
              placeholder="Optional"
            />
          </label>

          <label className={styles.wide}>
            Reason
            <textarea
              value={reason}
              onChange={(event) =>
                setReason(event.target.value)
              }
              rows={3}
              placeholder="Administrative registration reason"
            />
          </label>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleBulkRegister}
              disabled={
                busy || activeDivisions.length === 0
              }
            >
              Bulk register
            </button>

            <button
              type="submit"
              className={styles.primaryButton}
              disabled={
                busy || activeDivisions.length === 0
              }
            >
              {busy
                ? 'Saving...'
                : 'Register participant'}
            </button>
          </div>
        </form>

        {message && (
          <p className={styles.message}>{message}</p>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Roster</p>
          <h2>Current season participants</h2>
        </div>

        {participants.length ? (
          <div className={styles.list}>
            {participants.map((participant) => (
              <article
                className={styles.row}
                key={participant.id}
              >
                <div className={styles.identity}>
                  <strong>
                    {participant.player.gamer_tag}
                  </strong>

                  <span>
                    {participant.player.user?.email ??
                      participant.player.id}
                  </span>
                </div>

                <div className={styles.meta}>
                  <span>
                    {participant.division.name}
                  </span>

                  <span>
                    {statusLabels[
                      participant.status
                    ] ?? participant.status}
                  </span>

                  <span>
                    Seed: {participant.seed ?? '—'}
                  </span>
                </div>

                <div className={styles.actionsInline}>
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

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() =>
                      handleStatus(
                        participant.id,
                        'ACTIVE',
                      )
                    }
                    disabled={
                      busy ||
                      participant.status === 'ACTIVE'
                    }
                  >
                    Re-activate
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            No participants are assigned to this season
            yet.
          </p>
        )}
      </section>
    </main>
  );
}
