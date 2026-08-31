import AdminContent from './admin-content';
import { requireRole } from '../../lib/auth-guard';

export default async function RbacPage() {
  await requireRole('HQ_ADMIN', '/');

  return <AdminContent />;
}
