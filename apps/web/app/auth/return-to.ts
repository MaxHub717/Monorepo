const RETURN_TO_BASE = 'https://nexgen.invalid';
const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/verify', '/auth/dev-mailbox'];

export function getSafeReturnTo(search: string, canOpenAdmin = false): string | null {
  const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('returnTo');
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;

  try {
    const destination = new URL(value, RETURN_TO_BASE);
    if (destination.origin !== RETURN_TO_BASE) return null;
    const pathname = decodeURIComponent(destination.pathname);
    if (AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;
    if ((pathname === '/admin' || pathname.startsWith('/admin/')) && !canOpenAdmin) return null;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return null;
  }
}