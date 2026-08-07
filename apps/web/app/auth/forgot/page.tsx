"use client";
import { useState } from 'react';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    try {
      const res = await fetch('/api/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }), headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error('Failed');
      setStatus('sent');
    } catch (e) {
      setStatus('error');
    }
  }

  return (
    <main>
      <h1>Forgot Password</h1>
      <form onSubmit={submit}>
        <label>
          Email
          <input value={email} onChange={(e: any) => setEmail(e.currentTarget.value)} type="email" />
        </label>
        <button type="submit">Send reset link</button>
      </form>
      {status === 'sent' && <p>Reset link sent if the email exists.</p>}
      {status === 'error' && <p>Failed to send reset link.</p>}
    </main>
  );
}
