import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, apiFetch } from './api-client';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, error: null }), { status: 200 });
const failure = (status: number, code: string, message: string) => new Response(
  JSON.stringify({ success: false, error: { code, message } }),
  { status },
);

afterEach(() => vi.unstubAllGlobals());

describe('browser API authorization handling', () => {
  it('refreshes an expired access cookie once and retries the original request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failure(401, 'Unauthorized', 'Missing or invalid authorization'))
      .mockResolvedValueOnce(envelope({ status: 'refreshed' }))
      .mockResolvedValueOnce(envelope({ id: 'season-rules' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ id: string }>('/seasons/season-1/rules', { method: 'GET' });

    expect(result.id).toBe('season-rules');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh');
    expect(fetchMock.mock.calls[2][0]).toContain('/seasons/season-1/rules');
  });

  it('reports forbidden access distinctly and does not try to refresh it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failure(403, 'Forbidden', 'Insufficient permission privileges')));

    await expect(apiFetch('/seasons/season-1/rules', { method: 'PUT' })).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 403,
      message: 'You are signed in but do not have permission to manage this season.',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves validation messages for invalid rules', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failure(400, 'Bad Request', 'A Series must contain exactly three Games.')));

    await expect(apiFetch('/seasons/season-1/rules', { method: 'PUT' })).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 400,
      message: 'A Series must contain exactly three Games.',
    });
  });
});
