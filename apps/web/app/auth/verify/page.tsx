"use client";

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

// 1. All state, fetching logic, and UI go here
function VerifyPageContent() {
  const params = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('pending');

  useEffect(() => {
    if (!token) {
      setStatus('missing');
      return;
    }

    async function verify() {
      try {
        const res = await fetch('/api/v1/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token }),
          headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Verify failed');
        setStatus('ok');
      } catch (e) {
        setStatus('error');
      }
    }

    verify();
  }, [token]);

  return (
    <main>
      <h1>Email verification</h1>
      {status === 'pending' && <p>Verifying...</p>}
      {status === 'ok' && <p>Email verified. You may now log in.</p>}
      {status === 'error' && <p>Verification failed or token invalid.</p>}
      {status === 'missing' && <p>Missing token.</p>}
    </main>
  );
}

// 2. The main page export just wraps the content in Suspense
export default function VerifyPage() {
  return (
    <Suspense fallback={<main><h1>Email verification</h1><p>Loading...</p></main>}>
      <VerifyPageContent />
    </Suspense>
  );
}
