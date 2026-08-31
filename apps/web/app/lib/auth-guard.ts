import { redirect } from 'next/navigation';
import { apiServerFetch } from './api-server-client';

export type AuthenticatedUser = {
  id: string;
  email: string;
  roles?: string[];
};

export async function requireUser(
  redirectTo = '/auth/login',
): Promise<AuthenticatedUser> {
  try {
    return await apiServerFetch<AuthenticatedUser>('/users/me');
  } catch {
    redirect(redirectTo);
  }
}

export async function requireRole(
  requiredRole: string,
  redirectTo = '/',
): Promise<AuthenticatedUser> {
  try {
    const user = await apiServerFetch<AuthenticatedUser>('/users/me');

    if (!user.roles?.includes(requiredRole)) {
      redirect(redirectTo);
    }

    return user;
  } catch {
    redirect('/auth/login');
  }
}