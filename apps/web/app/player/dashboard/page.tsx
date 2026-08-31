import { requireUser } from '../../lib/auth-guard';
import PlayerDashboardContent from './player-dashboard-content';

export default async function PlayerDashboardPage() {
  const user = await requireUser('/auth/login');

  return (
    <PlayerDashboardContent
      user={{
        id: user.id,
        email: user.email,
      }}
    />
  );
}