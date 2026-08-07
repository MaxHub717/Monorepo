import Link from 'next/link';
import PageShell from '../components/page-shell';

export default function PenaltiesPage() {
  return (
    <PageShell title="Penalties" subtitle="Track warnings, sanctions, and appeals.">
      <p>Penalty cases and status updates will be listed here.</p>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
