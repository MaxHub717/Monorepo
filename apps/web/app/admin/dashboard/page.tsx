import Link from 'next/link';
import PageShell from '../../components/page-shell';
import { requireRole } from '../../lib/auth-guard';
import styles from './dashboard.module.css';

/**
 * Admin Dashboard
 *
 * Entry point for platform administration and league management.
 * Separates concerns into two distinct sections:
 *
 * 1. Platform Administration - user/role/permission management, audit
 * 2. League Management - leagues, seasons, competition operations
 *
 * Navigation is populated only with operational/implemented areas.
 * Future features are documented but not exposed as navigation until ready.
 */
export default async function AdminDashboardPage() {
  const user = await requireRole('HQ_ADMIN');

  return (
    <PageShell title="Admin Dashboard" subtitle="Platform administration and league operations.">
      <div className={styles.dashboardContainer}>
        {/* Welcome Card */}
        <div className={styles.welcomeCard}>
          <h2>Welcome, {user.email}</h2>
          <p>You have full administrative access to the NGL platform.</p>
          <p className={styles.subtitle}>
            Use the sections below to manage users, roles, leagues, seasons, and competition operations.
          </p>
        </div>

        {/* PLATFORM ADMINISTRATION SECTION */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Platform Administration</h3>
          <p className={styles.sectionDescription}>
            Manage platform-level configuration, users, roles, permissions, and access logs.
          </p>

          <div className={styles.cardGrid}>
            {/* Users & RBAC */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h4>Users & RBAC</h4>
              </div>
              <p className={styles.cardDescription}>Manage platform users, assign roles, and control permissions.</p>
              <Link href="/admin/users" className={styles.cardLink}>
                Manage Users →
              </Link>
            </div>

            {/* Audit Logs */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h4>Audit Logs</h4>
              </div>
              <p className={styles.cardDescription}>Review administrative actions and access history.</p>
              <Link href="/admin/audit" className={styles.cardLink}>
                View Audit Logs →
              </Link>
            </div>

            {/* Roles & Permissions */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h4>Roles & Permissions</h4>
              </div>
              <p className={styles.cardDescription}>
                Configure available roles and the permissions they grant.
              </p>
              <span className={styles.comingSoon}>Coming Soon</span>
            </div>
          </div>
        </section>

        {/* LEAGUE MANAGEMENT SECTION */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>League Management</h3>
          <p className={styles.sectionDescription}>
            Create and operate leagues, manage seasons, configure competitions, and oversee all league activities.
          </p>

          <div className={styles.cardGrid}>
            {/* Leagues */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h4>Leagues</h4>
              </div>
              <p className={styles.cardDescription}>
                Create new leagues and manage league-level configuration and operators.
              </p>
              <span className={styles.comingSoon}>Coming Soon (ADM-003)</span>
            </div>

            {/* Seasons */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h4>Seasons</h4>
              </div>
              <p className={styles.cardDescription}>
                Manage season lifecycle: create, configure, open/close registration, lock rosters, operate matches.
              </p>
              <span className={styles.comingSoon}>Coming Soon (ADM-004+)</span>
            </div>

            {/* Participants */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h4>Participants</h4>
              </div>
              <p className={styles.cardDescription}>
                Manage player registration, roster locking, and division assignments.
              </p>
              <span className={styles.comingSoon}>Coming Soon (ADM-009)</span>
            </div>

            {/* Fixtures */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h4>Fixtures & Scheduling</h4>
              </div>
              <p className={styles.cardDescription}>
                Generate, review, and adjust fixture schedules for divisions.
              </p>
              <span className={styles.comingSoon}>Coming Soon</span>
            </div>

            {/* Results */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h4>Results & Standings</h4>
              </div>
              <p className={styles.cardDescription}>
                Review submitted results, verify scores, and maintain official standings.
              </p>
              <span className={styles.comingSoon}>Coming Soon</span>
            </div>

            {/* Disputes */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h4>Disputes</h4>
              </div>
              <p className={styles.cardDescription}>
                Review contested matches and resolve disputes with evidence review.
              </p>
              <span className={styles.comingSoon}>Coming Soon</span>
            </div>

            {/* Penalties */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h4>Penalties</h4>
              </div>
              <p className={styles.cardDescription}>
                Issue and manage warnings, point deductions, suspensions, and bans.
              </p>
              <span className={styles.comingSoon}>Coming Soon</span>
            </div>
          </div>
        </section>

        {/* IMPLEMENTATION STATUS */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Implementation Status</h3>
          <div className={styles.statusCard}>
            <p>
              The Admin Dashboard is operational. Featured sections reflect the current implementation status:
            </p>
            <ul className={styles.statusList}>
              <li>
                <strong>ADM-001</strong>: Define Admin route and authorization contract ✅
              </li>
              <li>
                <strong>ADM-002</strong>: Build operational Admin Dashboard (this page) ✅
              </li>
              <li>
                <strong>ADM-003+</strong>: Additional admin workflows (in progress)
              </li>
            </ul>
            <p>
              Navigation links above point to implemented functionality. "Coming Soon" items indicate areas under development.
            </p>
          </div>
        </section>

        {/* QUICK REFERENCE */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Quick Reference</h3>
          <div className={styles.referenceGrid}>
            <div className={styles.referenceCard}>
              <h4>Available API Endpoints</h4>
              <code className={styles.code}>GET /api/v1/admin/users</code>
              <code className={styles.code}>GET /api/v1/admin/audit</code>
              <code className={styles.code}>GET /api/v1/admin/seasons</code>
              <p className={styles.smallText}>Full API documentation in implementation notes.</p>
            </div>

            <div className={styles.referenceCard}>
              <h4>Your Permissions</h4>
              <ul className={styles.permissionsList}>
                {user.permissions?.map((perm) => (
                  <li key={perm}>
                    <code>{perm}</code>
                  </li>
                ))}
                {!user.permissions || user.permissions.length === 0 ? (
                  <li>No specific permissions (superuser via role)</li>
                ) : null}
              </ul>
            </div>

            <div className={styles.referenceCard}>
              <h4>Your Roles</h4>
              <ul className={styles.rolesList}>
                {user.roles?.map((role) => (
                  <li key={role}>
                    <code>{role}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
