'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import PageShell from '../../../components/page-shell';
import { createSeason, LeagueSummary, CompetitionRulesetSummary, CompetitionRulesPreview, previewCompetitionRuleset } from '../../../lib/api-client';
import styles from './create-season.module.css';

type Props = { leagues: LeagueSummary[]; rulesets: CompetitionRulesetSummary[]; initialLeagueId?: string };

export default function CreateSeasonContent({ leagues, rulesets, initialLeagueId }: Props) {
  const [leagueId, setLeagueId] = useState(initialLeagueId ?? '');
  const [rulesetId, setRulesetId] = useState(rulesets[0]?.id ?? '');
  const [rulesPreview, setRulesPreview] = useState<CompetitionRulesPreview | null>(null);
  const [previewingRules, setPreviewingRules] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [divisionName, setDivisionName] = useState('Division 1');
  const [divisionType, setDivisionType] = useState('AMATEUR');
  const [divisionFormat, setDivisionFormat] = useState('ROUND_ROBIN_SINGLE');
  const [divisionCapacity, setDivisionCapacity] = useState('');
  const [registrationCapacity, setRegistrationCapacity] = useState('');
  const [competitionParticipantCount, setCompetitionParticipantCount] = useState('');
  const [schedulingPeriodDays, setSchedulingPeriodDays] = useState('7');
  const [matchesPerParticipant, setMatchesPerParticipant] = useState('1');
  const [matchWindowStartMinutes, setMatchWindowStartMinutes] = useState('');
  const [matchWindowEndMinutes, setMatchWindowEndMinutes] = useState('');
  const [matchWindowTimezone, setMatchWindowTimezone] = useState('UTC');
  const [concurrentMatches, setConcurrentMatches] = useState('1');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!leagueId || !rulesetId || !name.trim() || !startDate || !endDate) {
      setMessage('Choose a league, a published ruleset, and complete the required season fields.');
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
        rulesetId,
        name: name.trim(),
        description: description.trim() || undefined,
        startDate,
        endDate,
        divisionName: divisionName.trim() || undefined,
        divisionType,
        divisionFormat,
        divisionCapacity: divisionCapacity ? Number(divisionCapacity) : undefined,
        registrationCapacity: registrationCapacity ? Number(registrationCapacity) : undefined,
        competitionParticipantCount: competitionParticipantCount ? Number(competitionParticipantCount) : undefined,
        schedulingPeriodDays: Number(schedulingPeriodDays),
        matchesPerParticipant: Number(matchesPerParticipant),
        matchWindowStartMinutes: matchWindowStartMinutes ? Number(matchWindowStartMinutes) : undefined,
        matchWindowEndMinutes: matchWindowEndMinutes ? Number(matchWindowEndMinutes) : undefined,
        matchWindowTimezone: matchWindowTimezone.trim() || 'UTC',
        concurrentMatches: Number(concurrentMatches),
      });
      window.location.assign(`/admin/leagues/${leagueId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create season');
      setSaving(false);
    }
  }

  async function previewRules() {
    if (!rulesetId) return;
    setPreviewingRules(true);
    setMessage(null);
    try {
      setRulesPreview(await previewCompetitionRuleset(rulesetId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to preview the published rules.');
    } finally {
      setPreviewingRules(false);
    }
  }

  return (
    <PageShell title="Create Season" subtitle="Start a new season inside a permanent league.">
      <div className={styles.page}>
        <div className={styles.headerRow}><div><p className={styles.eyebrow}>Season setup</p><h2>New competition cycle</h2><p>New seasons begin in DRAFT so configuration can be reviewed before registration opens.</p></div><Link href="/admin/leagues" className={styles.backLink}>Back to leagues</Link></div>
        {leagues.length && rulesets.length ? <form className={styles.form} onSubmit={submit}>
          <fieldset><legend>Identity</legend><label>League<select required value={leagueId} onChange={(event) => setLeagueId(event.target.value)}><option value="">Choose an active league</option>{leagues.map((league) => <option value={league.id} key={league.id}>{league.name}{league.region ? ` - ${league.region}` : ''}</option>)}</select></label><label>Season name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Season 1" /></label><label className={styles.wide}>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="What is this season about?" /></label></fieldset>
          <fieldset><legend>Competition rules</legend><label>Published ruleset<select required value={rulesetId} onChange={(event) => { setRulesetId(event.target.value); setRulesPreview(null); }}><option value="">Choose a published version</option>{rulesets.map((ruleset) => <option value={ruleset.id} key={ruleset.id}>{ruleset.name} · v{ruleset.version}</option>)}</select></label><div className={styles.rulesActions}><button type="button" className={styles.secondaryButton} disabled={previewingRules || !rulesetId} onClick={previewRules}>{previewingRules ? 'Loading preview…' : 'Preview player rules'}</button><Link href="/admin/rulesets" className={styles.backLink}>Manage versions</Link></div></fieldset>
          {rulesPreview && <section className={styles.rulesPreview} aria-label="Player rules preview"><p className={styles.eyebrow}>{rulesPreview.playerFacing.name} · version {rulesPreview.playerFacing.version}</p>{rulesPreview.playerFacing.sections.map((section) => <details key={section.title}><summary>{section.title}</summary><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul></details>)}</section>}
          <fieldset><legend>Schedule window</legend><label>Start date<input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>End date<input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></fieldset>
          <fieldset><legend>Initial division</legend><p className={styles.help}>Registration capacity is the size of the pool. Competition capacity and field size bound fixture generation.</p><label>Division name<input required value={divisionName} onChange={(event) => setDivisionName(event.target.value)} /></label><label>Division type<select value={divisionType} onChange={(event) => setDivisionType(event.target.value)}><option value="AMATEUR">Amateur</option><option value="COMPETITIVE">Competitive</option><option value="ELITE">Elite</option><option value="VERIFIED_PRO">Verified Pro</option></select></label><label>Competition format<select value={divisionFormat} onChange={(event) => setDivisionFormat(event.target.value)}><option value="ROUND_ROBIN_SINGLE">Single round robin</option><option value="ROUND_ROBIN_DOUBLE">Double round robin</option></select></label><label>Competition capacity<input min="2" type="number" value={divisionCapacity} onChange={(event) => setDivisionCapacity(event.target.value)} placeholder="Optional" /></label><label>Registration capacity<input min="2" type="number" value={registrationCapacity} onChange={(event) => setRegistrationCapacity(event.target.value)} placeholder="Optional" /></label><label>Competition participant count<input min="2" type="number" value={competitionParticipantCount} onChange={(event) => setCompetitionParticipantCount(event.target.value)} placeholder="Uses capacity or all eligible" /></label></fieldset>
          <fieldset><legend>Scheduling density</legend><label>Period length (days)<input min="1" type="number" value={schedulingPeriodDays} onChange={(event) => setSchedulingPeriodDays(event.target.value)} /></label><label>Target matches per participant<input min="1" type="number" value={matchesPerParticipant} onChange={(event) => setMatchesPerParticipant(event.target.value)} /><small>This is a soft target per period, not a maximum. The complete competition schedule is always retained.</small></label><label>Concurrent matches<input min="1" type="number" value={concurrentMatches} onChange={(event) => setConcurrentMatches(event.target.value)} /></label><label>Window start (minutes)<input min="0" max="1439" type="number" value={matchWindowStartMinutes} onChange={(event) => setMatchWindowStartMinutes(event.target.value)} placeholder="Optional" /></label><label>Window end (minutes)<input min="1" max="1440" type="number" value={matchWindowEndMinutes} onChange={(event) => setMatchWindowEndMinutes(event.target.value)} placeholder="Optional" /></label><label>Window timezone<input value={matchWindowTimezone} onChange={(event) => setMatchWindowTimezone(event.target.value)} placeholder="UTC" /></label></fieldset>
          {message && <p className={styles.error}>{message}</p>}<div className={styles.actions}><Link href="/admin/leagues" className={styles.cancel}>Cancel</Link><button className={styles.primaryButton} disabled={saving}>{saving ? 'Creating season...' : 'Create draft season'}</button></div>
        </form> : <div className={styles.empty}>{!leagues.length ? <>Create an active League before creating a season.</> : <>Publish a Competition Ruleset before creating a season. <Link href="/admin/rulesets">Open Ruleset Administration</Link></>}</div>}
      </div>
    </PageShell>
  );
}
