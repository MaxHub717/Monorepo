import Link from 'next/link';
import PageShell from '../components/page-shell';
import { requirePermission } from '../lib/auth-guard'; 

export default async function AuditPage() { await requirePermission('VIEW_AUDIT', '/');
  return (
    <PageShell title="Audit Logs" subtitle="View audit history for league operations.">
      <p>Audit entries will be searchable and filterable here.</p>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
