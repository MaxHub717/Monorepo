'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { archiveLeague, assignLeagueOperator, getLeague, LeagueDetails, listAdminUsers, removeLeagueOperator, updateLeague } from '../../../lib/api-client';
import PageShell from '../../../components/page-shell';
import styles from '../leagues.module.css';

type Props = { league: LeagueDetails };

export default function LeagueWorkspace({ league: initialLeague }: Props) {
  const [league, setLeague] = useState(initialLeague);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [operators, setOperators] = useState<Array<{ id: string; email: string; username: string; user_roles?: Array<{ role?: { name: string } }> }>>([]);
  const [selectedOperator, setSelectedOperator] = useState('');

  useEffect(() => {
    listAdminUsers().then((users) => setOperators(users.filter((user) => user.user_roles?.some(({ role }) => ['OPERATOR', 'COMMISSIONER', 'HQ_ADMIN'].includes(role?.name ?? ''))))).catch(() => undefined);
  }, []);

  async function changeStatus(status: string) {
    setSaving(true);
    setMessage(null);
    try {
      setLeague({ ...league, ...(await updateLeague(league.id, { status })) });
      setMessage(`League marked ${status.toLowerCase()}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update league');
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!window.confirm('Archive this league?')) return;
    setSaving(true);
    try {
      await archiveLeague(league.id);
      setLeague({ ...league, status: 'ARCHIVED' });
      setMessage('League archived. Its history remains available.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to archive league');
    } finally {
      setSaving(false);
    }
  }

  async function assignOperator() {
    if (!selectedOperator) return;
    setSaving(true);
    try {
      await assignLeagueOperator(league.id, selectedOperator);
      setLeague(await getLeague(league.id));
      setSelectedOperator('');
      setMessage('Operator assigned to this league.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to assign operator');
    } finally {
      setSaving(false);
    }
  }

  async function removeOperator(userId: string) {
    setSaving(true);
    try {
      await removeLeagueOperator(league.id, userId);
      setLeague({ ...league, operators: league.operators.filter((operator) => operator.user_id !== userId) });
      setMessage('Operator removed from this league.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove operator');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title={league.name} subtitle="League workspace and operating history.">
      <div className={styles.page}>
        <div className={styles.headerRow}><div><p className={styles.eyebrow}>League workspace</p><h2>{league.region || 'Region not set'}</h2></div><Link className={styles.backLink} href="/admin/leagues">All leagues</Link></div>
        <section className={styles.createPanel}><div><p className={styles.eyebrow}>Settings</p><h3>{league.status}</h3><p>{league.description || 'No description provided.'}</p></div><div className={styles.form}><button className={styles.primaryButton} disabled={saving || league.status === 'ACTIVE'} onClick={() => changeStatus('ACTIVE')}>Activate</button><button className={styles.primaryButton} disabled={saving || league.status === 'INACTIVE'} onClick={() => changeStatus('INACTIVE')}>Deactivate</button><button className={styles.primaryButton} disabled={saving || league.status === 'ARCHIVED'} onClick={archive}>Archive</button></div></section>
        {message && <p className={styles.message}>{message}</p>}
        <section className={styles.card}><p className={styles.eyebrow}>Seasons</p><h3>Season history</h3><Link className={styles.cardLink} href={`/admin/seasons/new?leagueId=${league.id}`}>Create season in this league <span>-&gt;</span></Link>{league.seasons.length ? <div className={styles.stats}>{league.seasons.map((season) => <span key={season.id}><b>{season.name}</b>{season.status} · {season._count?.participants ?? 0} participants</span>)}</div> : <p>No seasons belong to this league yet.</p>}</section>
        <section className={styles.card}><p className={styles.eyebrow}>Operators</p><h3>Assigned league operators</h3><div className={styles.operatorForm}><select value={selectedOperator} onChange={(event) => setSelectedOperator(event.target.value)}><option value="">Select an operator</option>{operators.filter((user) => !league.operators.some((operator) => operator.user_id === user.id)).map((user) => <option key={user.id} value={user.id}>{user.username || user.email}</option>)}</select><button className={styles.primaryButton} disabled={saving || !selectedOperator} onClick={assignOperator}>Assign operator</button></div>{league.operators.length ? <div className={styles.stats}>{league.operators.map((operator) => <span key={operator.id}><b>{operator.user.username || operator.user.email}</b>{operator.region || 'League-wide scope'} <button className={styles.removeButton} disabled={saving} onClick={() => removeOperator(operator.user_id)}>Remove</button></span>)}</div> : <p>No operators are assigned to this league yet.</p>}</section>
      </div>
    </PageShell>
  );
}
