import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser, resendVerification, verifyEmail } from './auth-client';
import { getSafeReturnTo } from './return-to';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('registration and email verification UX', () => {
  it('accepts safe local return destinations and rejects external, auth-loop, and unauthorized admin paths', () => {
    expect(getSafeReturnTo('?returnTo=%2Fplayer%2Fdashboard%23league-identity')).toBe('/player/dashboard#league-identity');
    expect(getSafeReturnTo('?returnTo=%2Fadmin%2Fdashboard')).toBeNull();
    expect(getSafeReturnTo('?returnTo=%2Fadmin%2Fdashboard', true)).toBe('/admin/dashboard');
    expect(getSafeReturnTo('?returnTo=%2F%2Fevil.example')).toBeNull();
    expect(getSafeReturnTo('?returnTo=https%3A%2F%2Fevil.example')).toBeNull();
    expect(getSafeReturnTo('?returnTo=%2Fauth%2Flogin')).toBeNull();
    expect(getSafeReturnTo('?returnTo=%2Fauth%2Fdev-mailbox')).toBeNull();
  });

  it('shows a verification-pending state after registration instead of redirecting to login', () => {
    const page = read('./register/page.tsx');

    expect(page).toContain('Create League Identity');
    expect(page).toContain('Already have an account?');
    expect(page).toContain('setPendingEmail(email)');
    expect(page).toContain('setPendingReturnTo(getSafeReturnTo(window.location.search))');
    expect(page).toContain('cannot sign in until you verify your email address');
    expect(page).toContain('Resend verification email');
    expect(page).toContain('Open the local development email inbox');
    expect(page).toContain("process.env.NODE_ENV !== 'production'");
    expect(page).not.toContain("window.location.href = '/auth/login'");
    expect(page).toContain('role="alert"');
  });

  it('connects public identity actions to registration with a safe dashboard destination', () => {
    const home = read('../page.tsx');
    const navigation = read('../components/nav-bar.tsx');

    expect(home).toContain('/auth/register?returnTo=%2Fplayer%2Fdashboard');
    expect(navigation).toContain('/auth/register?returnTo=%2Fplayer%2Fdashboard');
  });

  it('preserves a validated destination from verification through sign-in', () => {
    const login = read('./login/page.tsx');
    const verification = read('./verify/page.tsx');

    expect(login).toContain('getSafeReturnTo(window.location.search, canOpenAdmin)');
    expect(login).toContain('window.location.assign(destination)');
    expect(verification).toContain('getSafeReturnTo(params.toString())');
    expect(verification).toContain('`/auth/login?returnTo=${encodeURIComponent(returnTo)}`');
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
    expect(page).toContain('href={loginHref}');
    expect(client).toContain("'/auth/verify-email'");
    expect(client).toContain("'/auth/resend-verification'");
  });

  it('hides development mail tooling in production at both page and API boundaries', () => {
    const page = read('./dev-mailbox/page.tsx');
    const client = read('./auth-client.ts');

    expect(page).toContain("process.env.NODE_ENV === 'production'");
    expect(client).toContain("'/auth/dev-mailbox?email=");
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

  it('maps account activation and email verification from the existing current-user API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        id: 'user-1',
        email: 'player@example.test',
        account_status: 'ACTIVE',
        email_verified_at: '2026-10-16T12:00:00.000Z',
        user_roles: [{ role: { name: 'PLAYER' } }],
        permissions: [],
      },
      error: null,
    }), { status: 200 })));

    await expect(getCurrentUser()).resolves.toMatchObject({
      id: 'user-1',
      accountStatus: 'ACTIVE',
      emailVerifiedAt: '2026-10-16T12:00:00.000Z',
      roles: ['PLAYER'],
    });
  });
});
