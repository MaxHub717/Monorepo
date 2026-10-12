'use client';

import Link from 'next/link';
import { useState } from 'react';
import PageShell from '../../components/page-shell';
import {
  CompetitionRulesDocument,
  SeasonRulesWorkspace,
  getSeasonRules,
  previewSeasonRules,
  publishSeasonRules,
  saveSeasonRules,
} from '../../lib/api-client';
import styles from './ruleset-admin.module.css';

type Area = keyof CompetitionRulesDocument;
type Props = {
  seasonId: string;
  seasonName: string;
  defaultRules: CompetitionRulesDocument;
  initialRules?: SeasonRulesWorkspace;
};

const areaTitles: Record<Area, string> = {
  competitionStructure: 'Competition structure',
  phasePlotRules: 'Phase and Plot rules',
  seriesGameRules: 'Series and Game rules',
  drawRules: 'Draw rules',
  advancement: 'Advancement',
  scheduling: 'Scheduling',
  checkIn: 'Check-in',
  results: 'Results',
  disputes: 'Disputes',
  penalties: 'Penalties',
  conduct: 'Conduct',
  participation: 'Participation',
  paymentFees: 'Payment and fees',
};

const fixedRules: Record<string, string> = {
  'seriesGameRules.gamesPerSeries': 'A Series always contains exactly three Games.',
  'drawRules.anyGameDraw': 'A draw in any Game eliminates both participants.',
  'advancement.unresolvedSeries': 'An unresolved Series eliminates both participants.',
  'scheduling.automaticDays': 'Automatic scheduling runs Monday through Saturday.',
  'scheduling.firstStartLocal': 'Automatic scheduling starts at 10:00 in the season timezone.',
  'scheduling.latestStartLocal': 'The latest automatic Series start is 21:00.',
  'scheduling.matchWindowEndLocal': 'The automatic scheduling window closes at 22:00.',
  'scheduling.timezonePolicy': 'Automatic scheduling uses the season timezone.',
  'checkIn.opensMinutesBefore': 'Check-in opens at T-60.',
  'checkIn.closesMinutesBefore': 'Check-in closes at T-30.',
  'checkIn.attendancePolicy': 'Both participants must check in to start a Series.',
  'results.deadlineMinutesAfterStart': 'Results are due at T+90.',
  'phasePlotRules.finalPhaseProtectionDays': 'The final seven days are reserved for the Final Phase.',
};

const dayOptions = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const choices: Record<string, Array<{ label: string; value: string }>> = {
  'drawRules.anyGameDraw': [{ label: 'Both participants eliminated', value: 'BOTH_ELIMINATED' }],
  'advancement.unresolvedSeries': [{ label: 'Both participants eliminated', value: 'BOTH_ELIMINATED' }],
  'checkIn.attendancePolicy': [{ label: 'Both participants required', value: 'BOTH_PARTICIPANTS_REQUIRED' }],
  'scheduling.timezonePolicy': [{ label: 'Season timezone', value: 'SEASON' }],
  'conduct.sportsmanshipPolicy': [{ label: 'Standard', value: 'STANDARD' }, { label: 'Strict', value: 'STRICT' }],
  'paymentFees.currency': [
    { label: 'Not applicable', value: '' }, { label: 'USD', value: 'USD' },
    { label: 'EUR', value: 'EUR' }, { label: 'GBP', value: 'GBP' },
  ],
};

function humanize(value: string) {
  return value.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase());
}

export default function SeasonRulesAdmin({ seasonId, seasonName, defaultRules, initialRules }: Props) {
  const [rules, setRules] = useState<CompetitionRulesDocument>(() => ({
    ...Object.fromEntries((Object.keys(defaultRules) as Area[]).map((area) => [
      area,
      { ...defaultRules[area], ...(initialRules?.rules?.[area] ?? {}) },
    ])),
  }) as CompetitionRulesDocument);
  const [status, setStatus] = useState(initialRules?.status ?? 'NOT_CONFIGURED');
  const [preview, setPreview] = useState(initialRules?.playerFacing ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const locked = status === 'PUBLISHED';

  function update(area: Area, key: string, value: unknown) {
    setRules((current) => ({ ...current, [area]: { ...current[area], [key]: value } }));
    setStatus('DRAFT');
    setPreview(null);
  }

  async function save() {
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      await saveSeasonRules(seasonId, rules);
      const saved = await getSeasonRules(seasonId);
      setRules(saved.rules ?? rules);
      setStatus(saved.status);
      setPreview(saved.playerFacing ?? null);
      setMessage('Season rules saved and validated.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to save season rules.');
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function previewRules() {
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      const result = await previewSeasonRules(seasonId);
      setPreview(result.playerFacing ?? null);
      setStatus(result.status);
      setMessage('Player-facing preview generated from the saved season rules.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to preview season rules.');
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      await publishSeasonRules(seasonId);
      const result = await getSeasonRules(seasonId);
      setStatus(result.status);
      setPreview(result.playerFacing ?? null);
      setMessage('Season rules published and locked.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to publish season rules.');
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function control(area: Area, key: string, value: unknown) {
    const ruleId = `${area}.${key}`;
    const disabled = busy || locked || Boolean(fixedRules[ruleId]);
    if (Array.isArray(value)) {
      return <div className={styles.checks}>{dayOptions.map((day) => (
        <label key={day} className={styles.check}><input type="checkbox" checked={value.includes(day)} disabled={disabled}
          onChange={(event) => {
            const selected = new Set(event.target.checked ? [...value, day] : value.filter((item) => item !== day));
            update(area, key, dayOptions.filter((option) => selected.has(option)));
          }} />{humanize(day)}</label>
      ))}</div>;
    }
    if (typeof value === 'boolean') {
      return <input type="checkbox" checked={value} disabled={disabled} onChange={(event) => update(area, key, event.target.checked)} />;
    }
    if (typeof value === 'number') {
      return <input type="number" min={0} value={value} disabled={disabled} onChange={(event) => update(area, key, Number(event.target.value))} />;
    }
    if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) {
      return <input type="time" value={value} disabled={disabled} onChange={(event) => update(area, key, event.target.value)} />;
    }
    const options = choices[ruleId];
    if (options) {
      return <select value={value == null ? '' : String(value)} disabled={disabled} onChange={(event) => update(area, key, event.target.value || null)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>;
    }
    return <input type="text" value={value == null ? '' : String(value)} disabled={disabled} onChange={(event) => update(area, key, event.target.value)} />;
  }

  return (
    <PageShell title={`${seasonName} Rules`} subtitle="Rules configured and versioned for this season only.">
      <main className={styles.page}>
        <header className={styles.header}>
          <div><Link href={`/admin/seasons/${seasonId}`} className={styles.backLink}>Season overview</Link><p className={styles.eyebrow}>Season rules</p><h2>{seasonName}</h2><p>Defaults are copied into this season when first saved. Other seasons never inherit these settings.</p></div>
          <span className={locked ? styles.published : styles.draft}>{status.replaceAll('_', ' ')}</span>
        </header>
        <div className={styles.rulesForm}>
          {(Object.keys(areaTitles) as Area[]).map((area) => <fieldset className={styles.area} key={area}>
            <legend>{areaTitles[area]}</legend>
            {Object.entries(rules[area]).map(([key, value]) => {
              const description = fixedRules[`${area}.${key}`];
              return <label key={key} className={styles.rule}>
                <span>{humanize(key)}{description && <small>{description}</small>}</span>
                {control(area, key, value)}
              </label>;
            })}
          </fieldset>)}
        </div>
        {message && <p className={error ? styles.error : styles.message} role={error ? 'alert' : 'status'}>{message}</p>}
        <div className={styles.actions}>
          {locked && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => { setStatus('VALID'); setMessage('A new same-season draft version is ready to edit. Save it to create the version.'); setError(false); }}>Create next draft version</button>}
          <button type="button" className={styles.secondaryButton} disabled={busy || !preview} onClick={previewRules}>Preview saved rules</button>
          {!locked && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save season rules'}</button>}
          {!locked && <button type="button" className={styles.primaryButton} disabled={busy || status !== 'VALID'} onClick={publish}>Publish and lock rules</button>}
        </div>
        {preview && <section className={styles.preview} aria-label="Player-facing rules preview">
          <div><p className={styles.eyebrow}>Player-facing preview</p><h3>{preview.name} · v{preview.version}</h3></div>
          {preview.sections.map((section) => <details key={section.title}><summary>{section.title}</summary><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul></details>)}
        </section>}
      </main>
    </PageShell>
  );
}
