'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import PageShell from '../../../components/page-shell';
import { createSeason, LeagueSummary } from '../../../lib/api-client';
import styles from './create-season.module.css';

type Props = { leagues: LeagueSummary[]; initialLeagueId?: string };

export default function CreateSeasonContent({ leagues, initialLeagueId }: Props) {
  const [leagueId, setLeagueId] = useState(initialLeagueId ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [divisionName, setDivisionName] = useState('Division 1');
  const [divisionType, setDivisionType] = useState('AMATEUR');
  const [divisionFormat, setDivisionFormat] = useState('ROUND_ROBIN_SINGLE');
  const [divisionCapacity, setDivisionCapacity] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!leagueId || !name.trim() || !startDate || !endDate) {
      setMessage('Choose a league and complete the required season fields.');
      return;
    }
    if (endDate <= startDate) {
      setMessage('The season end date must be after the start date.');
      return;
    }
    setSaving(true);
    try {
      const season = await createSeason({
        leagueId,
        name: name.trim(),
        description: description.trim() || undefined,
        startDate,
        endDate,
        divisionName: divisionName.trim() || undefined,
        divisionType,
        divisionFormat,
        divisionCapacity: divisionCapacity ? Number(divisionCapacity) : undefined,
      });
      window.location.assign(`/admin/leagues/${leagueId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create season');
      setSaving(false);
    }
  }

  return (
    <PageShell title="Create Season" subtitle="Start a new season inside a permanent league.">
      <div className={styles.page}>
        <div className={styles.headerRow}><div><p className={styles.eyebrow}>Season setup</p><h2>New competition cycle</h2><p>New seasons begin in DRAFT so configuration can be reviewed before registration opens.</p></div><Link href="/admin/leagues" className={styles.backLink}>Back to leagues</Link></div>
        {leagues.length ? <form className={styles.form} onSubmit={submit}>
          <fieldset><legend>Identity</legend><label>League<select required value={leagueId} onChange={(event) => setLeagueId(event.target.value)}><option value="">Choose an active league</option>{leagues.map((league) => <option value={league.id} key={league.id}>{league.name}{league.region ? ` - ${league.region}` : ''}</option>)}</select></label><label>Season name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Season 1" /></label><label className={styles.wide}>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="What is this season about?" /></label></fieldset>
          <fieldset><legend>Schedule window</legend><label>Start date<input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>End date<input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></fieldset>
          <fieldset><legend>Initial division</legend><p className={styles.help}>This creates the first division with the season. Additional divisions can be configured later.</p><label>Division name<input required value={divisionName} onChange={(event) => setDivisionName(event.target.value)} /></label><label>Division type<select value={divisionType} onChange={(event) => setDivisionType(event.target.value)}><option value="AMATEUR">Amateur</option><option value="COMPETITIVE">Competitive</option><option value="ELITE">Elite</option><option value="VERIFIED_PRO">Verified Pro</option></select></label><label>Competition format<select value={divisionFormat} onChange={(event) => setDivisionFormat(event.target.value)}><option value="ROUND_ROBIN_SINGLE">Single round robin</option><option value="ROUND_ROBIN_DOUBLE">Double round robin</option></select></label><label>Capacity<input min="2" type="number" value={divisionCapacity} onChange={(event) => setDivisionCapacity(event.target.value)} placeholder="Optional" /></label></fieldset>
          {message && <p className={styles.error}>{message}</p>}<div className={styles.actions}><Link href="/admin/leagues" className={styles.cancel}>Cancel</Link><button className={styles.primaryButton} disabled={saving}>{saving ? 'Creating season...' : 'Create draft season'}</button></div>
        </form> : <div className={styles.empty}>Create an active League before creating a season.</div>}
      </div>
    </PageShell>
  );
}
