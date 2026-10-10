'use client';

import Link from 'next/link';
import { useState } from 'react';
import PageShell from '../../components/page-shell';
import {
  CompetitionRulesDocument,
  CompetitionRulesetSummary,
  CompetitionRulesPreview,
  createCompetitionRuleset,
  previewCompetitionRuleset,
  publishCompetitionRuleset,
  updateCompetitionRuleset,
  listCompetitionRulesets,
} from '../../lib/api-client';
import styles from './ruleset-admin.module.css';

type Props = { initialRulesets: CompetitionRulesetSummary[]; defaultRules: CompetitionRulesDocument };

export default function RulesetAdmin({ initialRulesets, defaultRules }: Props) {
  const [rulesets, setRulesets] = useState(initialRulesets);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('Standard Competition');
  const [version, setVersion] = useState('1.0.0');
  const [description, setDescription] = useState('');
  const [supersedesRulesetId, setSupersedesRulesetId] = useState('');
  const [rulesJson, setRulesJson] = useState(JSON.stringify(defaultRules, null, 2));
  const [preview, setPreview] = useState<CompetitionRulesPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const selected = rulesets.find((ruleset) => ruleset.id === selectedId) ?? null;
  const published = selected?.status === 'PUBLISHED';

  async function refresh() {
    setRulesets(await listCompetitionRulesets());
  }

  async function selectRuleset(ruleset: CompetitionRulesetSummary) {
    setSelectedId(ruleset.id);
    setName(ruleset.name);
    setVersion(ruleset.version);
    setDescription(ruleset.description ?? '');
    setSupersedesRulesetId(ruleset.supersedes_ruleset_id ?? '');
    setPreview(null);
    setBusy(true);
    try {
      const result = await previewCompetitionRuleset(ruleset.id);
      setRulesJson(JSON.stringify(result.rules, null, 2));
      setPreview(result);
      setMessage('');
      setError(false);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to load Ruleset version.');
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function parseRules(): CompetitionRulesDocument | null {
    try {
      return JSON.parse(rulesJson) as CompetitionRulesDocument;
    } catch {
      setMessage('Rules must be valid JSON before they can be saved.');
      setError(true);
      return null;
    }
  }

  async function saveDraft() {
    const rules = parseRules();
    if (!rules) return;
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      if (selected && !published) {
        await updateCompetitionRuleset(selected.id, { name, description, rules });
        setMessage('Draft Ruleset saved. Preview it before publication.');
      } else {
        const created = await createCompetitionRuleset({
          name,
          version,
          description,
          rules,
          supersedesRulesetId: supersedesRulesetId || undefined,
        });
        setSelectedId(created.id);
        setMessage(`Draft version ${created.version} created. Review and preview it before publication.`);
      }
      await refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to save Ruleset draft.');
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function previewDraft() {
    if (!selected || published) {
      setMessage('Save a draft Ruleset before previewing it.');
      setError(true);
      return;
    }
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      await saveDraft();
      const result = await previewCompetitionRuleset(selected.id);
      setPreview(result);
      setRulesJson(JSON.stringify(result.rules, null, 2));
      setMessage('Preview generated from the saved authoritative Ruleset.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to preview Ruleset.');
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft() {
    if (!selected || published || !preview) {
      setMessage('Save and preview a draft before publishing it.');
      setError(true);
      return;
    }
    if (!window.confirm(`Publish ${name} version ${version}? Published Rulesets are immutable.`)) return;
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      await publishCompetitionRuleset(selected.id);
      await refresh();
      const publishedPreview = await previewCompetitionRuleset(selected.id);
      setPreview(publishedPreview);
      setMessage(`Version ${version} published. It can now be attached to Seasons.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to publish Ruleset.');
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function startNewVersion() {
    if (!selected) return;
    setName(selected.name);
    setVersion('');
    setDescription(selected.description ?? '');
    setSupersedesRulesetId(selected.id);
    setSelectedId('');
    setPreview(null);
    setMessage('New draft will supersede the selected published version.');
    setError(false);
  }

  return (
    <PageShell title="Competition Rulesets" subtitle="Authoritative, versioned Season rules.">
      <main className={styles.page}>
        <header className={styles.header}>
          <div><Link href="/admin/dashboard" className={styles.backLink}>Admin dashboard</Link><p className={styles.eyebrow}>Season governance</p><h2>Ruleset versions</h2><p>Published versions are immutable. Create a new version to change rules for future Seasons.</p></div>
          <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => {
            setSelectedId(''); setName('Standard Competition'); setVersion(''); setDescription('');
            setSupersedesRulesetId(''); setRulesJson(JSON.stringify(defaultRules, null, 2)); setPreview(null);
          }}>New draft</button>
        </header>

        <div className={styles.layout}>
          <aside className={styles.versionList} aria-label="Ruleset version list">
            <div className={styles.listHeading}><h3>Versions</h3><span>{rulesets.length}</span></div>
            {rulesets.length === 0 ? <p className={styles.empty}>No Rulesets created.</p> : rulesets.map((ruleset) => (
              <button type="button" key={ruleset.id} className={ruleset.id === selectedId ? styles.versionSelected : styles.version}
                onClick={() => selectRuleset(ruleset)} disabled={busy}>
                <strong>{ruleset.name}</strong><span>v{ruleset.version}</span><small>{ruleset.status}{ruleset.published_at ? ` · ${new Date(ruleset.published_at).toLocaleDateString()}` : ''}</small>
              </button>
            ))}
          </aside>

          <section className={styles.editor}>
            <div className={styles.editorHeader}><div><p className={styles.eyebrow}>{published ? 'Immutable publication' : 'Editable draft'}</p><h3>{selected ? `${selected.name} · v${selected.version}` : 'Create Ruleset version'}</h3></div><span className={published ? styles.published : styles.draft}>{published ? 'Published' : 'Draft'}</span></div>
            <div className={styles.fields}>
              <label>Name<input value={name} disabled={busy || published} onChange={(event) => setName(event.target.value)} /></label>
              <label>Version<input value={version} disabled={busy || Boolean(selected)} onChange={(event) => setVersion(event.target.value)} placeholder="1.0.0" /></label>
              <label className={styles.wide}>Description<input value={description} disabled={busy || published} onChange={(event) => setDescription(event.target.value)} /></label>
              <label className={styles.wide}>Supersedes version<select value={supersedesRulesetId} disabled={busy || Boolean(selected)} onChange={(event) => setSupersedesRulesetId(event.target.value)}><option value="">No previous version</option>{rulesets.filter((ruleset) => ruleset.status === 'PUBLISHED').map((ruleset) => <option key={ruleset.id} value={ruleset.id}>{ruleset.name} · v{ruleset.version}</option>)}</select></label>
              <label className={styles.wide}>Authoritative rules document<textarea value={rulesJson} disabled={busy || published} rows={24} spellCheck={false} onChange={(event) => { setRulesJson(event.target.value); setPreview(null); }} /></label>
            </div>
            <div className={styles.actions}>
              {!published && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={saveDraft}>Save draft</button>}
              {!published && <button type="button" className={styles.secondaryButton} disabled={busy || !selected} onClick={previewDraft}>Preview player rules</button>}
              {!published && <button type="button" className={styles.primaryButton} disabled={busy || !selected || !preview} onClick={publishDraft}>Publish version</button>}
              {published && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={startNewVersion}>Create next version</button>}
            </div>
            {message && <p className={error ? styles.error : styles.message} role={error ? 'alert' : 'status'}>{message}</p>}
            {preview && <section className={styles.preview} aria-label="Generated player rules preview"><div><p className={styles.eyebrow}>Player-facing preview</p><h3>{preview.playerFacing.name} · v{preview.playerFacing.version}</h3><span>SHA-256 {preview.rulesHash}</span></div><pre>{preview.playerFacing.text}</pre></section>}
          </section>
        </div>
      </main>
    </PageShell>
  );
}
