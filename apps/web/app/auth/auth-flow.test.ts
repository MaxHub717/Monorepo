import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resendVerification, verifyEmail } from './auth-client';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('registration and email verification UX', () => {
  it('shows a verification-pending state after registration instead of redirecting to login', () => {
    const page = read('./register/page.tsx');

    expect(page).toContain('setPendingEmail(email)');
    expect(page).toContain('cannot sign in until you verify your email address');
    expect(page).toContain('Resend verification email');
    expect(page).toContain('Open the local development email inbox');
    expect(page).not.toContain("window.location.href = '/auth/login'");
    expect(page).toContain('role="alert"');
  });

  it('uses the configured API helper and presents verification success, failure, retry, and login states', () => {
    const page = read('./verify/page.tsx');
    const client = read('./auth-client.ts');

    expect(page).toContain('verifyEmail(token)');
    expect(page).toContain("status === 'success'");
    expect(page).toContain("status === 'invalid'");
    expect(page).toContain("status === 'error'");
    expect(page).toContain('Retry verification');
    expect(page).toContain('Resend verification email');
    expect(page).toContain('href="/auth/login"');
    expect(client).toContain("'/auth/verify-email'");
    expect(client).toContain("'/auth/resend-verification'");
  });

  it('resends and verifies through the supported auth API routes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { success: true }, error: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { success: true }, error: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await resendVerification('player@example.com');
    await verifyEmail('verification-id.secret');

    expect(fetchMock.mock.calls[0][0]).toContain('/auth/resend-verification');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ email: 'player@example.com' }) });
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/verify-email');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ token: 'verification-id.secret' }) });
  });
});
