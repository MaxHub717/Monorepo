"use client";

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// 1. Move all form logic, hooks, and your submit handler here
function ResetPageContent() {
  const params = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed');
      setStatus('ok');
    } catch (e) {
      setStatus('error');
    }
  }

  return (
    <main>
      <h1>Reset Password</h1>
      {!token && <p>Missing token.</p>}
      {token && (
        <form onSubmit={submit}>
          <label>
            New password
            <input 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              type="password" 
            />
          </label>
          <button type="submit">Reset</button>
        </form>
      )}
      {status === 'ok' && <p>Password reset. You may now log in.</p>}
      {status === 'error' && <p>Reset failed.</p>}
    </main>
  );
}

// 2. Main default export wrapped cleanly in a Suspense component
export default function ResetPage() {
  return (
    <Suspense fallback={<main><h1>Reset Password</h1><p>Loading...</p></main>}>
      <ResetPageContent />
    </Suspense>
  );
}
