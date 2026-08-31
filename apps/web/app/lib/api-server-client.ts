import 'server-only';

import { cookies } from 'next/headers';
import type { ApiEnvelope } from '@nexgen/shared';

const API_BASE =
  process.env.API_INTERNAL_BASE_URL ??
  'http://localhost:3000/api/v1';

export async function apiServerFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      ...options.headers,
    },
    cache: 'no-store',
  });

  const payload = await res.json().catch(() => null) as
    | ApiEnvelope<T>
    | { error?: { message?: string } }
    | null;

  if (!res.ok) {
    const message =
      payload &&
      'error' in payload &&
      payload.error?.message
        ? payload.error.message
        : 'API request failed';

    throw new Error(message);
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'success' in payload &&
    'data' in payload
  ) {
    return payload.data as T;
  }

  return payload as T;
}