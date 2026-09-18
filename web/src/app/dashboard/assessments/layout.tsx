'use client';

import { usePathname, useRouter } from 'next/navigation';
import { TabNav, type TabItem } from '@/components/dashboard';

type AssessmentTab = 'overview' | 'online' | 'offline';

const TABS: TabItem<AssessmentTab>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'Offline' },
];

const TAB_ROUTES: Record<AssessmentTab, string> = {
  overview: '/dashboard/assessments',
  online: '/dashboard/assessments/online',
  offline: '/dashboard/assessments/offline',
};

function activeTab(pathname: string): AssessmentTab {
  if (pathname.startsWith('/dashboard/assessments/online')) return 'online';
  if (pathname.startsWith('/dashboard/assessments/offline')) return 'offline';
  return 'overview';
}

export default function AssessmentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="space-y-5">
      <TabNav
        label="Assessment sections"
        tabs={TABS}
        value={activeTab(pathname)}
        onChange={(tab) => router.push(TAB_ROUTES[tab])}
      />
      {children}
    </div>
  );
}
