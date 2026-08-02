import React from 'react';
import styles from './layout.module.css';

export default function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.pageWrapper}>
      <header className={styles.pageHeader}>
        <div>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </header>
      <main className={styles.pageContent}>{children}</main>
    </div>
  );
}
