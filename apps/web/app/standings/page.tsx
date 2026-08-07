import Link from 'next/link';
import PageShell from '../components/page-shell';

export default function StandingsPage() {
  return (
    <PageShell title="Standings" subtitle="Current league rankings by season and division.">
      <p>Live standings will appear here once the API is connected.</p>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
