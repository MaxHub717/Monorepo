'use client';

import { useEffect, useState } from 'react';
import { getMyNotifications, markMyNotificationsRead, PersonalNotification } from '../lib/api-client';

function formatEventType(notification: PersonalNotification) {
  return (notification.event_type ?? notification.category ?? 'Notification').replaceAll('_', ' ').toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function NotificationCenter({ id }: { id?: string }) {
  const [notifications, setNotifications] = useState<PersonalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getMyNotifications().then((result) => {
      if (current) setNotifications(result);
    }).catch((loadError: unknown) => {
      if (current) setError(loadError instanceof Error ? loadError.message : 'Unable to load your notifications.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, []);

  async function refreshNotifications() {
    setLoading(true);
    setError(null);
    try {
      setNotifications(await getMyNotifications());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your notifications.');
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    setMarkingRead(true);
    setMessage(null);
    setActionError(null);
    try {
      const result = await markMyNotificationsRead();
      setMessage(result.updated === 0
        ? 'There are no unread notifications.'
        : `${result.updated} notification${result.updated === 1 ? '' : 's'} marked as read.`);
      await refreshNotifications();
    } catch (actionFailure) {
      setActionError(actionFailure instanceof Error ? actionFailure.message : 'Unable to mark notifications as read.');
    } finally {
      setMarkingRead(false);
    }
  }

  const hasUnread = notifications.some((notification) => !notification.read);

  return (
    <section id={id} aria-labelledby="personal-notifications-heading">
      <h2 id="personal-notifications-heading">Personal Notifications</h2>
      <p>These notifications are private to your account. Public announcements appear on public league and season pages.</p>
      {loading ? <p role="status">Loading your notifications...</p> : null}
      {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => void refreshNotifications()}>Retry</button></div> : null}
      {!loading && !error && notifications.length === 0 ? <p>You have no personal notifications yet.</p> : null}
      {!error && notifications.length > 0 ? (
        <>
          {hasUnread ? <button type="button" disabled={markingRead} onClick={() => void markAllRead()}>
            {markingRead ? 'Marking as read...' : 'Mark all as read'}
          </button> : null}
          <ul>{notifications.map((notification) => (
            <li key={notification.id}>
              <article>
                <h3>{notification.title}</h3>
                <p>{notification.message}</p>
                <p>{formatEventType(notification)} · {notification.priority.toLowerCase()} · {notification.read ? 'Read' : 'Unread'}</p>
                <time dateTime={notification.created_at}>{formatCreatedAt(notification.created_at)}</time>
              </article>
            </li>
          ))}</ul>
        </>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
    </section>
  );
}