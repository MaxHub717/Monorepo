const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

type ApiError = {
  error?: {
    message?: string;
  };
};

async function authFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  const payload = (await response.json().catch(() => null)) as
    | T
    | ApiError
    | null;

  if (!response.ok) {
    const message =
      (payload as ApiError | null)?.error?.message ?? 'Authentication request failed';

    throw new Error(message);
  }

  return payload as T;
}

export async function login(email: string, password: string) {
  return authFetch<{
    success: boolean;
    data: {
      userId: string;
    };
    error: null;
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
    }),
  });
}

export async function register(
  email: string,
  username: string,
  gamerTag: string,
  password: string,
) {
  return authFetch<{
    success: boolean;
    data: {
      userId: string;
      status: string;
    };
    error: null;
  }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      username,
      gamerTag,
      password,
    }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch<{ success: boolean }>('/auth/logout', {
    method: 'POST',
  });
}