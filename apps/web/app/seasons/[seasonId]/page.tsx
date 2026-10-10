import { notFound } from 'next/navigation';
import { requirePermission } from '../../lib/auth-guard';
import { apiServerFetch } from '../../lib/api-server-client';
import type { SeasonOverview } from '../../lib/api-client';
import SeasonWorkspace from './season-workspace';

export default async function SeasonWorkspacePage({ params }: { params: { seasonId: string } }) {
  await requirePermission('MANAGE_SEASONS', '/');
  try {
    const overview = await apiServerFetch<SeasonOverview>(`/seasons/${params.seasonId}/overview`);
    return <SeasonWorkspace initialOverview={overview} />;
  } catch {
    notFound();
  }
}
