import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('season rules administration flow', () => {
  it('creates seasons without requesting a global published ruleset list', () => {
    const creationPage = read('./new/page.tsx');
    const creationForm = read('./new/create-season-content.tsx');

    expect(creationPage).not.toContain('publishedOnly=true');
    expect(creationForm).not.toContain('rulesetId');
    expect(creationForm).toContain('Save draft season');
  });

  it('does not expose round-robin or retired fixture-density properties during season creation', () => {
    const creationForm = read('./new/create-season-content.tsx');
    const apiClient = read('../../lib/api-client.ts');
    const createSeasonContract = apiClient.match(/export async function createSeason\([\s\S]*?\): Promise<SeasonSummary>/)?.[0] ?? '';

    for (const retiredField of [
      'divisionFormat',
      'schedulingPeriodDays',
      'matchesPerParticipant',
      'matchWindowStartMinutes',
      'matchWindowEndMinutes',
      'matchWindowTimezone',
      'concurrentMatches',
    ]) {
      expect(creationForm).not.toContain(retiredField);
      expect(createSeasonContract).not.toContain(retiredField);
    }
    expect(creationForm).not.toContain('ROUND_ROBIN_');
    expect(createSeasonContract).not.toBe('');
  });

  it('opens the rules workspace for the saved season and uses controls instead of JSON editing', () => {
    const overview = read('./[seasonId]/page.tsx');
    const editor = read('../rulesets/season-rules-admin.tsx');

    expect(overview).toContain('`/admin/seasons/${season.id}/rules`');
    expect(overview).toContain('Season Rules — Configure rules');
    expect(editor).not.toMatch(/<textarea\b/);
    expect(editor).toContain('type="number"');
    expect(editor).toContain('type="checkbox"');
    expect(editor).toContain('type="time"');
    expect(editor).toContain('Save season rules');
    expect(editor).toContain('Preview saved rules');
    expect(editor).toContain('role={error ? \'alert\' : \'status\'}');
  });
});
