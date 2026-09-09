import Link from 'next/link';
import PageShell from '../components/page-shell';
import { requirePermission } from '../lib/auth-guard'; 

export default async function ResultsPage() { await requirePermission('MANAGE_RESULTS', '/');
  return (
    <PageShell title="Results" subtitle="Submit and confirm match results.">
      <p>Result submission and confirmation workflows will be available here.</p>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
