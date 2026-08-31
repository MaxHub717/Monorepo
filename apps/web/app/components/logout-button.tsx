'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '../auth/auth-client';

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;

    setLoading(true);

    try {
      await logout();
    } finally {
      router.replace('/auth/login');
      router.refresh();
    }
  }

  return (
    <button type="button" onClick={handleLogout} disabled={loading}>
      {loading ? 'Signing out...' : 'Logout'}
    </button>
  );
}