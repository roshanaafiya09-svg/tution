'use client';

import { PortalSidebar, PortalSidebarDrawer, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from './portal-sidebar';
import { PARENT_NAV, PARENT_NAV_FOOTER } from './parent-nav';

export { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED };

const PARENT_SIDEBAR_CONFIG = {
  navGroups: PARENT_NAV,
  navFooter: PARENT_NAV_FOOTER,
  homeHref: '/parent',
  portalLabel: 'Parent Portal',
};

/** Fixed rail for tablet and desktop — thin wrapper over the shared
 *  `PortalSidebar` with the Parent Portal's own nav config. Same component,
 *  layout, and styling as `TeacherSidebar`/`AcademySidebar`; only the nav
 *  data differs. */
export function ParentSidebar({
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
      config={PARENT_SIDEBAR_CONFIG}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      canToggle={canToggle}
    />
  );
}

/** Slide-out drawer for mobile. */
export function ParentSidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <PortalSidebarDrawer config={PARENT_SIDEBAR_CONFIG} open={open} onClose={onClose} />;
}
