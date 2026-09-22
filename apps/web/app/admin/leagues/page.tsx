import { requirePermission } from '../../lib/auth-guard';
import LeaguesContent from './leagues-content';

export default async function AdminLeaguesPage() {
  await requirePermission('VIEW_ADMIN_DASHBOARD');
  return <LeaguesContent />;
}
