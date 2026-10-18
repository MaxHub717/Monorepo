import { requireUser } from '../../lib/auth-guard';
import PageShell from '../../components/page-shell';
import CareerHistoryContent from '../../player/career-history-content';

export default async function MyCareerPage() {
  await requireUser('/auth/login?returnTo=%2Fcareer%2Fme');

  return (
    <PageShell title="My Career" subtitle="Your recorded season participation and published competition results.">
      <CareerHistoryContent />
    </PageShell>
  );
}