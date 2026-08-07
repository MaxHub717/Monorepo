import { redirect } from 'next/navigation';
import { getUserMe } from './api-client';

export async function requireUser(redirectTo = '/player/dashboard') {
  try {
    const user = await getUserMe();
    return user;
  } catch (error) {
    redirect('/');
  }
}

export async function requireRole(requiredRole: string, redirectTo = '/') {
  try {
    const user = await getUserMe();
    if (!user.roles?.includes(requiredRole)) {
      redirect('/');
    }

    return user;
  } catch (error) {
    redirect('/');
  }
}
