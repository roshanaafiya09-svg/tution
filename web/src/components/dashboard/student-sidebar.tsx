'use client';

import { PortalSidebar, PortalSidebarDrawer, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from './portal-sidebar';
import { STUDENT_NAV, STUDENT_NAV_FOOTER } from './student-nav';

export { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED };

const STUDENT_SIDEBAR_CONFIG = {
  navGroups: STUDENT_NAV,
  navFooter: STUDENT_NAV_FOOTER,
  homeHref: '/student',
  portalLabel: 'Student Portal',
};

/** Fixed rail for tablet and desktop — thin wrapper over the shared
 *  `PortalSidebar` with the Student Portal's own nav config. Same
 *  component, layout, and styling as `TeacherSidebar`/`AcademySidebar`;
 *  only the nav data differs. */
export function StudentSidebar({
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
      config={STUDENT_SIDEBAR_CONFIG}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      canToggle={canToggle}
    />
  );
}

/** Slide-out drawer for mobile. */
export function StudentSidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <PortalSidebarDrawer config={STUDENT_SIDEBAR_CONFIG} open={open} onClose={onClose} />;
}
