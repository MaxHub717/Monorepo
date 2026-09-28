import { notFound } from 'next/navigation';
import { requirePermission } from '../../../lib/auth-guard';
import { apiServerFetch } from '../../../lib/api-server-client';
import { AdminParticipant, SeasonOverview } from '../../../lib/api-client';
import ParticipantManagement from './participant-management';

export default async function SeasonParticipantsPage({
  params,
}: {
  params: { seasonId: string };
}) {
  await requirePermission('MANAGE_SEASONS', '/');

  try {
    const [overview, participants] = await Promise.all([
      apiServerFetch<SeasonOverview>(
        `/seasons/${params.seasonId}/overview`,
      ),
      apiServerFetch<AdminParticipant[]>(
        `/admin/seasons/${params.seasonId}/participants`,
      ),
    ]);

    return (
      <ParticipantManagement
        seasonId={params.seasonId}
        initialOverview={overview}
        initialParticipants={participants}
      />
    );
  } catch (error) {
    console.error(
      `Failed to load participants workspace for season ${params.seasonId}:`,
      error,
    );

    notFound();
  }
}