import Link from 'next/link';
import PageShell from '../components/page-shell';
import { requirePermission } from '../lib/auth-guard'; 

export default async function DisputesPage() { await requirePermission('MANAGE_DISPUTES', '/');

  return (
    <PageShell title="Disputes" subtitle="Review and track open dispute cases.">
      <p>Dispute details and operator workflow will appear here.</p>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
