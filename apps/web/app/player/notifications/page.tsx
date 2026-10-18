import { requireUser } from '../../lib/auth-guard';
import PageShell from '../../components/page-shell';
import NotificationCenter from '../notification-center';

export default async function PlayerNotificationsPage() {
  await requireUser('/auth/login?returnTo=%2Fplayer%2Fnotifications');

  return (
    <PageShell title="Personal Notifications" subtitle="Competition updates connected to your participation.">
      <NotificationCenter />
    </PageShell>
  );
}