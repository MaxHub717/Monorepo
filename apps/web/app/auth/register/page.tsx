"use client";
import { useState } from 'react';
import Link from 'next/link';
import { register, resendVerification } from '../auth-client';
import { getSafeReturnTo } from '../return-to';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [gamerTag, setGamerTag] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingReturnTo, setPendingReturnTo] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(email, username, gamerTag, password);
      setPendingEmail(email);
      setPendingReturnTo(getSafeReturnTo(window.location.search));
    } catch (err: any) {
      setError(err?.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!pendingEmail) return;
    setResending(true);
    setResendMessage(null);
    setResendError(null);
    try {
      await resendVerification(pendingEmail);
      setResendMessage('If this address has a pending account, a new verification email has been queued.');
    } catch (err) {
      setResendError(err instanceof Error ? err.message : 'Unable to resend the verification email.');
    } finally {
      setResending(false);
    }
  }

  if (pendingEmail) {
    return (
      <main>
        <h1>Verify your email</h1>
        <p>Your account was created, but you cannot sign in until you verify your email address.</p>
        <p>We sent a verification message to <strong>{pendingEmail}</strong>. Open its link to activate your account.</p>
        {process.env.NODE_ENV !== 'production' && <p><Link href={`/auth/dev-mailbox?email=${encodeURIComponent(pendingEmail)}`}>Open the local development email inbox</Link></p>}
        <button type="button" onClick={resend} disabled={resending}>{resending ? 'Sending...' : 'Resend verification email'}</button>
        {resendMessage && <p role="status">{resendMessage}</p>}
        {resendError && <p role="alert">{resendError}</p>}
        <p><Link href={pendingReturnTo ? `/auth/login?returnTo=${encodeURIComponent(pendingReturnTo)}` : '/auth/login'}>Already verified? Go to login</Link></p>
      </main>
    );
  }

  return (
    <main>
      <h1>Create League Identity</h1>
      <p>Already have an account? <Link href="/auth/login">Sign in</Link></p>
      <form onSubmit={submit}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" />
        </label>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          Gamer Tag
          <input value={gamerTag} onChange={(e) => setGamerTag(e.target.value)} required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="new-password" />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Registering...' : 'Register'}</button>
        {error && <div role="alert" style={{ color: 'red' }}>{error}</div>}
      </form>
    </main>
  );
}
