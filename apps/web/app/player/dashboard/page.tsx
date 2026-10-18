import { requireUser } from '../../lib/auth-guard';
import PlayerDashboardContent from './player-dashboard-content';

export default async function PlayerDashboardPage() {
  const user = await requireUser('/auth/login?returnTo=%2Fplayer%2Fdashboard');

  return (
    <PlayerDashboardContent
      user={{
        id: user.id,
        email: user.email,
        accountStatus: user.account_status,
        emailVerifiedAt: user.email_verified_at,
      }}
    />
  );
}