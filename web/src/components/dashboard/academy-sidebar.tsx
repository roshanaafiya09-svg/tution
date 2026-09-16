'use client';

import { PortalSidebar, PortalSidebarDrawer, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from './portal-sidebar';
import { ACADEMY_NAV_FOOTER, withNotificationsBadge } from './academy-nav';

export { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED };

/** Fixed rail for tablet and desktop — thin wrapper over the shared
 *  `PortalSidebar` with the Academy Portal's own nav config. Same
 *  component, layout, and styling as `TeacherSidebar`; only the nav data
 *  differs, per the Navigation, Routing & UX Update spec. `unreadCount`
 *  (from AcademyShell's shared poll) is stamped onto the Notifications
 *  item per render — see withNotificationsBadge. */
export function AcademySidebar({
  collapsed,
  onToggleCollapse,
  canToggle,
  unreadCount = 0,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  canToggle: boolean;
  unreadCount?: number;
}) {
  return (
    <PortalSidebar
      config={{
        navGroups: withNotificationsBadge(unreadCount),
        navFooter: ACADEMY_NAV_FOOTER,
        homeHref: '/academy',
        portalLabel: 'Academy Portal',
      }}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      canToggle={canToggle}
    />
  );
}

/** Slide-out drawer for mobile. */
export function AcademySidebarDrawer({
  open,
  onClose,
  unreadCount = 0,
}: {
  open: boolean;
  onClose: () => void;
  unreadCount?: number;
}) {
  return (
    <PortalSidebarDrawer
      config={{
        navGroups: withNotificationsBadge(unreadCount),
        navFooter: ACADEMY_NAV_FOOTER,
        homeHref: '/academy',
        portalLabel: 'Academy Portal',
      }}
      open={open}
      onClose={onClose}
    />
  );
}
