import Link from 'next/link';
import PageShell from '../../components/page-shell';
import { requireRole } from '../../lib/auth-guard';

export default async function AdminDashboardPage() {
  const user = await requireRole('HQ_ADMIN');

  return (
    <PageShell title="Admin Dashboard" subtitle="Operations, pending approvals, and audit oversight.">
      <p>Welcome, {user.email}. You are authorized to review league operations.</p>
      <p>Admin dashboard content will be available here.</p>
      <ul>
        <li>
          <Link href="/admin/rbac">Role-based access control management</Link>
        </li>
      </ul>
      <Link href="/">Return home</Link>
    </PageShell>
  );
}
