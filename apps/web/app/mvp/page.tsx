import Link from 'next/link';
import PageShell from '../components/page-shell';

export default function MvpPage() {
  return (
    <PageShell title="MVP Leaderboard" subtitle="Top performers and award winners.">
      <p>The MVP leaderboard will be displayed here.</p>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
