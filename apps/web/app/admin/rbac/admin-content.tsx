'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  listAdminUsers,
  assignUserRole,
  revokeUserRole,
} from '../../lib/api-client';

const availableRoles = [
  'PLAYER',
  'CLUB_MANAGER',
  'OPERATOR',
  'COMMISSIONER',
  'HQ_ADMIN',
];

type AdminUser = {
  id: string;
  email: string;
  user_roles?: Array<{ role?: { name: string } }>;
};

export default function AdminContent() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('PLAYER');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refreshUsers() {
    try {
      const data = await listAdminUsers();

      setUsers(data);

      if (!selectedUserId && data.length > 0) {
        setSelectedUserId(data[0].id);
      }
    } catch {
      setMessage('Unable to load users.');
    }
  }

  useEffect(() => {
    refreshUsers();
  }, []);

  const selectedUser = users.find(
    (user) => user.id === selectedUserId,
  );

  async function assignRole() {
    if (!selectedUserId) return;

    setMessage(null);
    setLoading(true);

    try {
      await assignUserRole(selectedUserId, selectedRole);
      await refreshUsers();

      setMessage(
        `Assigned ${selectedRole} to ${selectedUser?.email ?? 'user'}`,
      );
    } catch (error: any) {
      setMessage(error?.message ?? 'Failed to assign role');
    } finally {
      setLoading(false);
    }
  }

  async function revokeRole(roleName: string) {
    if (!selectedUserId || !roleName) return;

    setMessage(null);
    setLoading(true);

    try {
      await revokeUserRole(selectedUserId, roleName);
      await refreshUsers();

      setMessage(
        `Revoked ${roleName} from ${selectedUser?.email ?? 'user'}`,
      );
    } catch (error: any) {
      setMessage(error?.message ?? 'Failed to revoke role');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>RBAC Admin</h1>

      <Link href="/admin/dashboard">
        Back to Admin Dashboard
      </Link>

      {message && (
        <p style={{ color: 'green' }}>
          {message}
        </p>
      )}

      <section style={{ marginTop: 20 }}>
        <label>
          Select user:
          <select
            value={selectedUserId}
            onChange={(event) =>
              setSelectedUserId(event.currentTarget.value)
            }
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Current roles</h2>

        <ul>
          {selectedUser?.user_roles?.map((userRole) => {
            const roleName = userRole.role?.name;

            if (!roleName) return null;

            return (
              <li key={roleName}>
                {roleName}

                <button
                  type="button"
                  onClick={() => revokeRole(roleName)}
                  style={{ marginLeft: 8 }}
                  disabled={loading}
                >
                  Revoke
                </button>
              </li>
            );
          })}

          {selectedUser?.user_roles?.length === 0 && (
            <li>No roles assigned</li>
          )}
        </ul>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Assign role</h2>

        <label>
          Role:
          <select
            value={selectedRole}
            onChange={(event) =>
              setSelectedRole(event.currentTarget.value)
            }
          >
            {availableRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={assignRole}
          style={{ marginLeft: 12 }}
          disabled={loading || !selectedUserId}
        >
          {loading ? 'Updating...' : 'Assign role'}
        </button>
      </section>
    </main>
  );
}
