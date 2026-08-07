import { API_VERSION } from '@nexgen/shared';

const apiVersion = API_VERSION;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export type UserSession = {
  userId: string;
  email: string;
  roles: string[];
  token: string;
};

export async function apiFetch<T>(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? 'API request failed');
  }

  return res.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  return apiFetch<{ accessToken: string; refreshToken: string; userId: string }>(`/${apiVersion}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, username: string, password: string) {
  return apiFetch<{ userId: string; status: string }>(`/${apiVersion}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ email, username, password }),
  });
}

export async function getMe() {
  return apiFetch<{
    id: string;
    email: string;
    roles: Array<string | { name?: string; role?: { name: string } }>;
  }>(`/${apiVersion}/users/me`, { method: 'GET' });
}

export async function listAdminUsers() {
  return apiFetch<Array<{ id: string; email: string; user_roles?: Array<{ role?: { name: string } }> }>>(`/${apiVersion}/admin/users`, { method: 'GET' });
}

export async function assignUserRole(userId: string, roleName: string) {
  return apiFetch(`/${apiVersion}/admin/users/${userId}/roles`, {
    method: 'POST',
    body: JSON.stringify({ userId, roleName }),
  });
}

export async function revokeUserRole(userId: string, roleName: string) {
  return apiFetch(`/${apiVersion}/admin/users/${userId}/roles/${roleName}`, {
    method: 'DELETE',
  });
}
