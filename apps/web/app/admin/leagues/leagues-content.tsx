'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import PageShell from '../../components/page-shell';
import { createLeague, LeagueSummary, listLeagues } from '../../lib/api-client';
import styles from './leagues.module.css';

export default function LeaguesContent() {
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [region, setRegion] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      setLeagues(await listLeagues());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load leagues');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      await createLeague({ name, description, region });
      setName('');
      setDescription('');
      setRegion('');
      await refresh();
      setMessage('League created successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create league');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="Leagues" subtitle="Permanent competition containers and their operating history.">
      <div className={styles.page}>
        <div className={styles.headerRow}>
          <div><p className={styles.eyebrow}>League management</p><h2>Competitive organizations</h2></div>
          <Link className={styles.backLink} href="/admin/dashboard">Back to dashboard</Link>
        </div>

        <section className={styles.createPanel}>
          <div><p className={styles.eyebrow}>New league</p><h3>Create a permanent league</h3><p>Seasons are created inside a league and retain its history.</p></div>
          <form className={styles.form} onSubmit={submit}>
            <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="NGL Professional" /></label>
            <label>Region<input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Cross River State" /></label>
            <label className={styles.wide}>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="League identity and operating scope" /></label>
            <button className={styles.primaryButton} disabled={saving}>{saving ? 'Creating...' : 'Create league'}</button>
          </form>
        </section>

        {message && <p className={styles.message}>{message}</p>}
        {loading ? <p>Loading leagues...</p> : leagues.length ? <div className={styles.grid}>{leagues.map((league) => <article className={styles.card} key={league.id}><div className={styles.cardTop}><span className={styles.status}>{league.status}</span><span>{league.region || 'Region not set'}</span></div><h3>{league.name}</h3><p>{league.description || 'No description provided.'}</p><div className={styles.stats}><span><b>{league._count?.seasons ?? 0}</b> seasons</span><span><b>{league._count?.operators ?? 0}</b> operators</span></div><Link className={styles.cardLink} href={`/admin/leagues/${league.id}`}>Open league workspace <span>-&gt;</span></Link></article>)}</div> : <div className={styles.empty}>No leagues exist yet. Create the first permanent league above.</div>}
      </div>
    </PageShell>
  );
}
