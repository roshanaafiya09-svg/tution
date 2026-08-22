'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleUser } from 'lucide-react';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { ParentCard } from '@/components/parent';

export default function ParentSettingsPage() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    void api.get<Me>('/auth/me').then(setMe);
  }, []);

  return (
    <div>
      <PageHeader eyebrow="Your account" title="Settings" description="Account shortcuts." />

      <div className="max-w-xl space-y-4">
        {me && (
          <ParentCard>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">Signed in as</p>
            <p className="mt-1 text-sm font-medium text-neutral-800 dark:text-neutral-100">{me.email ?? me.phoneE164}</p>
          </ParentCard>
        )}

        <ParentCard className="p-0">
          <Link
            href="/parent/account"
            className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            <CircleUser className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Account</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Login details, data export, and account deletion.
              </p>
            </div>
          </Link>
        </ParentCard>
      </div>
    </div>
  );
}
