import type { Metadata } from 'next';
import React from 'react';
import NavBar from './components/nav-bar';
import styles from './components/layout.module.css';

export const metadata: Metadata = {
  title: 'NexGen League',
  description: 'Discover esports leagues and seasons, follow competition activity, and build your league identity.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className={styles.appShell}>
          <NavBar />
          <main className={styles.layoutMain}>{children}</main>
        </div>
      </body>
    </html>
  );
}
