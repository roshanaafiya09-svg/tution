'use client';

import { PortalSidebar, PortalSidebarDrawer, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from './portal-sidebar';
import { ACADEMY_NAV, ACADEMY_NAV_FOOTER } from './academy-nav';

export { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED };

const ACADEMY_SIDEBAR_CONFIG = {
  navGroups: ACADEMY_NAV,
  navFooter: ACADEMY_NAV_FOOTER,
  homeHref: '/academy',
  portalLabel: 'Academy Portal',
};

/** Fixed rail for tablet and desktop — thin wrapper over the shared
 *  `PortalSidebar` with the Academy Portal's own nav config. Same
 *  component, layout, and styling as `TeacherSidebar`; only the nav data
 *  differs, per the Navigation, Routing & UX Update spec. */
export function AcademySidebar({
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
      config={ACADEMY_SIDEBAR_CONFIG}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      canToggle={canToggle}
    />
  );
}

/** Slide-out drawer for mobile. */
export function AcademySidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <PortalSidebarDrawer config={ACADEMY_SIDEBAR_CONFIG} open={open} onClose={onClose} />;
}
