import Link from 'next/link';
import PageShell from '../components/page-shell';

export default function FixturesPage() {
  return (
    <PageShell title="Fixtures" subtitle="Upcoming and completed matches.">
      <p>Fixture listings will be loaded from the league API.</p>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
