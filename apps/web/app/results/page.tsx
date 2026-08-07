import Link from 'next/link';
import PageShell from '../components/page-shell';

export default function ResultsPage() {
  return (
    <PageShell title="Results" subtitle="Submit and confirm match results.">
      <p>Result submission and confirmation workflows will be available here.</p>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
