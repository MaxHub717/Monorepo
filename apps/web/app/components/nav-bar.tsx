import Link from 'next/link';
import styles from './layout.module.css';

export default function NavBar() {
  return (
    <nav className={styles.navLinks}>
      <Link href="/">Home</Link>
      <Link href="/standings">Standings</Link>
      <Link href="/fixtures">Fixtures</Link>
      <Link href="/mvp">MVP</Link>
      <Link href="/clubs">Clubs</Link>
      <Link href="/player/dashboard">Player</Link>
      <Link href="/club/dashboard">Club</Link>
      <Link href="/admin/dashboard">Admin</Link>
    </nav>
  );
}
