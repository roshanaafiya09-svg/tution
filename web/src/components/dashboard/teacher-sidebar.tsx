'use client';

import { PortalSidebar, PortalSidebarDrawer, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from './portal-sidebar';
import { TEACHER_NAV_FOOTER, teacherNavFor } from './teacher-nav';
import { useTeachingContext } from '@/components/teaching-context-provider';

export { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED };

/** The rail follows the teaching profile: Individual-only business pages
 *  (marketplace, rates, earnings, verification...) disappear while working
 *  under an academy, and academy-only pages (leave) while working
 *  independently. */
function useTeacherSidebarConfig() {
  const { current } = useTeachingContext();
  return {
    navGroups: teacherNavFor(current.kind),
    navFooter: TEACHER_NAV_FOOTER,
    homeHref: '/dashboard',
    portalLabel: current.kind === 'academy' ? current.label : 'Teacher Portal',
  };
}

/** Fixed rail for tablet and desktop. Tablet keeps it permanently collapsed
 *  (icons only) — `canToggle` is false there. Thin wrapper over the shared
 *  `PortalSidebar` with the Teacher Portal's own nav config — see
 *  `academy-sidebar.tsx` for the Academy Portal's twin. */
export function TeacherSidebar({
  collapsed,
  onToggleCollapse,
  canToggle,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  canToggle: boolean;
}) {
  const config = useTeacherSidebarConfig();
  return (
    <PortalSidebar
      config={config}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      canToggle={canToggle}
    />
  );
}

/** Slide-out drawer for mobile. */
export function TeacherSidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const config = useTeacherSidebarConfig();
  return <PortalSidebarDrawer config={config} open={open} onClose={onClose} />;
}
