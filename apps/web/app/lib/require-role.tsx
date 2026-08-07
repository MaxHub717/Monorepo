"use client";
import { useEffect, useState, PropsWithChildren } from 'react';
import { useRouter } from 'next/navigation';
import { getMe } from '../auth/auth-client';

export default function RequireRole({ children, role }: PropsWithChildren<{ role: string }>) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let mounted = true;
    getMe()
      .then((u) => {
        const roles = (u.roles ?? []).map((r: any) => r.role?.name ?? r.name ?? r);
        if (!mounted) return;
        if (roles.includes(role)) setOk(true);
        else router.replace('/');
      })
      .catch(() => router.replace('/'));
    return () => {
      mounted = false;
    };
  }, [role, router]);

  if (!ok) return null;
  return <>{children}</>;
}
