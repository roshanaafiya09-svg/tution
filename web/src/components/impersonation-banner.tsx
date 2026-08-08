'use client';

import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { impersonationStore } from '@/lib/impersonation';
import type { ImpersonationTarget } from '@/lib/impersonation';

const ROLE_LABEL: Record<ImpersonationTarget['role'], string> = {
  tutor: 'Teacher',
  student: 'Student',
  parent: 'Parent',
};

export function ImpersonationBanner({ target }: { target: ImpersonationTarget }) {
  const router = useRouter();

  function backToSuperAdmin() {
    impersonationStore.stop();
    router.replace('/admin');
  }

  const label = target.displayName ?? target.email ?? target.phoneE164;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-accent-500 px-6 py-2 text-sm font-medium text-neutral-900">
      <span className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" aria-hidden />
        Viewing as Super Admin — {label} ({ROLE_LABEL[target.role]})
      </span>
      <button
        type="button"
        onClick={backToSuperAdmin}
        className="rounded-md bg-neutral-900/10 px-2.5 py-1 text-sm font-semibold transition-colors hover:bg-neutral-900/20 focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        ← Back to Super Admin
      </button>
    </div>
  );
}
