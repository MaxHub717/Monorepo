import Link from 'next/link';
import PageShell from '../../components/page-shell';
import { requireRole } from '../../lib/auth-guard';

export default async function ClubDashboardPage() {
  const user = await requireRole('CLUB_MANAGER');

  return (
    <PageShell title="Club Dashboard" subtitle="Roster, fixtures, and club management.">
      <p>Welcome, {user.email}. You are authorized to manage club operations.</p>
      <p>Club dashboard content and actions will be available here.</p>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
