import Link from 'next/link';
import PageShell from '../components/page-shell';
import { requirePermission } from '../lib/auth-guard'; 

export default async function PenaltiesPage() { await requirePermission('MANAGE_PENALTIES', '/');
  return (
    <PageShell title="Penalties" subtitle="Track warnings, sanctions, and appeals.">
      <p>Penalty cases and status updates will be listed here.</p>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
