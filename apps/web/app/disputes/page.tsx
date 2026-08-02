import Link from 'next/link';
import PageShell from '../components/page-shell';

export default function DisputesPage() {
  return (
    <PageShell title="Disputes" subtitle="Review and track open dispute cases.">
      <p>Dispute details and operator workflow will appear here.</p>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
