'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DevelopmentVerificationMessage, getDevelopmentMailbox } from '../auth-client';

function DevelopmentMailboxContent() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [messages, setMessages] = useState<DevelopmentVerificationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMailbox(address: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await getDevelopmentMailbox(address);
      setMessages(result.data.messages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The local email inbox is unavailable.');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialEmail = params.get('email');
    if (!initialEmail) return;
    setEmail(initialEmail);
    void loadMailbox(initialEmail);
  }, [params]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadMailbox(email);
  }

  return (
    <main>
      <h1>Local development email inbox</h1>
      <p>This in-memory inbox is available only while the API runs in development mode.</p>
      <form onSubmit={submit}>
        <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <button type="submit" disabled={loading}>{loading ? 'Checking inbox...' : 'Check inbox'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {!error && !loading && email && messages.length === 0 && <p role="status">No messages for this address yet.</p>}
      <ul>
        {messages.map((message) => <li key={message.id}>
          <h2>{message.subject}</h2>
          <p>To: {message.to} · {new Date(message.createdAt).toLocaleString()}</p>
          <p>{message.text}</p>
          <a href={message.verificationUrl}>Verify email address</a>
        </li>)}
      </ul>
    </main>
  );
}

export default function DevelopmentMailboxPage() {
  if (process.env.NODE_ENV === 'production') return <main><h1>Not found</h1></main>;
  return <Suspense fallback={<main><h1>Local development email inbox</h1><p>Loading inbox...</p></main>}><DevelopmentMailboxContent /></Suspense>;
}
