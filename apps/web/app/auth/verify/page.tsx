"use client";

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState, Suspense } from 'react';
import { resendVerification, verifyEmail } from '../auth-client';

function VerifyPageContent() {
  const params = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<'verifying' | 'success' | 'invalid' | 'error' | 'missing'>(token ? 'verifying' : 'missing');
  const [retry, setRetry] = useState(0);
  const requestRef = useRef<{ token: string; request: Promise<{ success: boolean }> } | null>(null);
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('missing');
      return;
    }

    let cancelled = false;
    const request = requestRef.current?.token === token
      ? requestRef.current.request
      : verifyEmail(token);
    requestRef.current = { token, request };
    request.then(() => {
      if (!cancelled) {
        setStatus('success');
      }
    }).catch((caught: unknown) => {
      if (cancelled) return;
      const message = caught instanceof Error ? caught.message : 'Unable to verify this email address.';
      requestRef.current = null;
      setStatus(/invalid|expired/i.test(message) ? 'invalid' : 'error');
    });

    return () => { cancelled = true; };
  }, [token, retry]);

  async function resend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResending(true);
    setResendMessage(null);
    setResendError(null);
    try {
      await resendVerification(email);
      setResendMessage('If this address has a pending account, a new verification message has been queued.');
    } catch (caught) {
      setResendError(caught instanceof Error ? caught.message : 'Unable to resend the verification email.');
    } finally {
      setResending(false);
    }
  }

  return (
    <main>
      <h1>Email verification</h1>
      {status === 'verifying' && <p role="status">Verifying your email address...</p>}
      {status === 'success' && <><p role="status">Your email is verified. You can now sign in.</p><Link href="/auth/login">Go to login</Link></>}
      {status === 'invalid' && <><p role="alert">This verification link is invalid, expired, or already used. Request a new link below.</p><button type="button" onClick={() => { setStatus('verifying'); setRetry((attempt) => attempt + 1); }}>Retry verification</button></>}
      {status === 'error' && <><p role="alert">We could not verify your email because of a server or connection error. Retry, or request another link below.</p><button type="button" onClick={() => { setStatus('verifying'); setRetry((attempt) => attempt + 1); }}>Retry verification</button></>}
      {status === 'missing' && <p role="alert">This page needs the verification link from your email. You can request a fresh link below.</p>}
      {status !== 'success' && status !== 'verifying' && <form onSubmit={resend}>
        <label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <button type="submit" disabled={resending}>{resending ? 'Sending...' : 'Resend verification email'}</button>
        {resendMessage && <p role="status">{resendMessage}</p>}
        {resendError && <p role="alert">{resendError}</p>}
      </form>}
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<main><h1>Email verification</h1><p>Loading...</p></main>}>
      <VerifyPageContent />
    </Suspense>
  );
}
