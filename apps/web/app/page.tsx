import Link from 'next/link';
import PageShell from './components/page-shell';
import styles from './components/layout.module.css';

export default function HomePage() {
  return (
    <PageShell title="NexGen Esport" subtitle="A competitive league platform for players, clubs, and operators.">
      <section className={styles.homeIntro}>
        <p>
          Build and manage league seasons, club rosters, match operations, and league governance
          with a modern esports administration experience.
        </p>
      </section>

      <div className={styles.cardGrid}>
        <Link href="/standings" className={styles.card}>
          <h2>Standings</h2>
          <p>View current league rankings by division and season.</p>
        </Link>
        <Link href="/fixtures" className={styles.card}>
          <h2>Fixtures</h2>
          <p>Browse upcoming and completed matches.</p>
        </Link>
        <Link href="/mvp" className={styles.card}>
          <h2>MVP</h2>
          <p>Track top performers and award leaders.</p>
        </Link>
        <Link href="/clubs" className={styles.card}>
          <h2>Clubs</h2>
          <p>Explore club profiles, applications, and rosters.</p>
        </Link>
        <Link href="/seasons" className={styles.card}>
          <h2>Seasons</h2>
          <p>Manage season structure, divisions, and calendar.</p>
        </Link>
        <Link href="/disputes" className={styles.card}>
          <h2>Disputes</h2>
          <p>Review disputes and league adjudication workflow.</p>
        </Link>
      </div>

      <div className={styles.dashboardCards}>
        <Link href="/player/dashboard" className={styles.card}>
          <h2>Player Dashboard</h2>
          <p>Access your player profile, upcoming fixtures, and match actions.</p>
        </Link>
        <Link href="/club/dashboard" className={styles.card}>
          <h2>Club Dashboard</h2>
          <p>Manage club roster, schedule, and match operations.</p>
        </Link>
        <Link href="/admin/dashboard" className={styles.card}>
          <h2>Admin Dashboard</h2>
          <p>Review league operations, approvals, and governance workflows.</p>
        </Link>
      </div>
    </PageShell>
  );
}
