import Link from 'next/link';
import { apiServerFetch } from '../lib/api-server-client';
import LogoutButton from './logout-button';
import styles from './layout.module.css';

type CurrentUser = {
  roles?: string[];
  permissions?: string[];
};

async function getCurrentUser() {
  try {
    return await apiServerFetch<CurrentUser>('/users/me');
  } catch {
    return null;
  }
}

export default async function NavBar() {
  const user = await getCurrentUser();
  const canOpenAdmin = user?.permissions?.includes('VIEW_ADMIN_DASHBOARD') ?? false;
  const isGamer = Boolean(user && !canOpenAdmin);

  return (
    <header className={styles.siteHeader}>
      <Link className={styles.brand} href="/">NexGen League</Link>
      <nav aria-label="Primary navigation" className={styles.navLinks}>
        <Link href="/">Home</Link>
        <Link href="/competitions">Competitions</Link>
        <Link href={isGamer ? '/career/me' : '/career'}>Career</Link>
        <Link href={isGamer ? '/player/dashboard#league-identity' : '/auth/register?returnTo=%2Fplayer%2Fdashboard%23league-identity'}>My League Identity</Link>
      </nav>
      <div className={styles.navActions}>
        {isGamer ? (
          <>
            <Link href="/player/notifications">Notifications</Link>
            <Link href="/player/dashboard">My Dashboard</Link>
          </>
        ) : null}
        {canOpenAdmin ? <Link href="/admin/dashboard">Admin workspace</Link> : null}
        {user ? (
          <LogoutButton />
        ) : (
          <>
            <Link href="/auth/login">Sign in</Link>
            <Link className={styles.navPrimaryAction} href="/auth/register?returnTo=%2Fplayer%2Fdashboard">Create League Identity</Link>
          </>
        )}
      </div>
    </header>
  );
}
