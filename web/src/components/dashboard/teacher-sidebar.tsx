'use client';

import { PortalSidebar, PortalSidebarDrawer, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from './portal-sidebar';
import { TEACHER_NAV, TEACHER_NAV_FOOTER } from './teacher-nav';

export { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED };

const TEACHER_SIDEBAR_CONFIG = {
  navGroups: TEACHER_NAV,
  navFooter: TEACHER_NAV_FOOTER,
  homeHref: '/dashboard',
  portalLabel: 'Teacher Portal',
};

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
  return (
    <PortalSidebar
      config={TEACHER_SIDEBAR_CONFIG}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      canToggle={canToggle}
    />
  );
}

/** Slide-out drawer for mobile. */
export function TeacherSidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <PortalSidebarDrawer config={TEACHER_SIDEBAR_CONFIG} open={open} onClose={onClose} />;
}
