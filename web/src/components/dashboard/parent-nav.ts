import { Building2, CircleUser, Home, Megaphone, MessagesSquare, Search, Settings, Sparkles, User, UserPlus } from 'lucide-react';
import { isPortalNavItemActive, type PortalNavGroup, type PortalNavItem } from './portal-sidebar';
import type { AppNotification } from '@/lib/types';

/** The Parent Portal's information architecture, in sidebar order — mirrors
 *  academy-nav.ts's ACADEMY_NAV shape, with Parent's own nav items. */
export const PARENT_NAV: PortalNavGroup[] = [
  {
    label: 'Main',
    items: [{ href: '/parent', label: 'Today', icon: Home, exact: true }],
  },
  {
    label: 'Discover',
    items: [
      { href: '/parent/find-a-teacher', label: 'Find a Teacher', icon: Search },
      { href: '/parent/find-an-academy', label: 'Find an Academy', icon: Building2 },
    ],
  },
  {
    label: 'My Children',
    items: [{ href: '/parent/link', label: 'Link a Child', icon: UserPlus }],
  },
  {
    label: 'Communication',
    items: [{ href: '/parent/messages', label: 'Messages', icon: MessagesSquare }],
  },
  {
    label: 'Premium',
    items: [{ href: '/parent/premium', label: 'Premium', icon: Sparkles }],
  },
];

/** Pinned to the bottom of the rail, above the sign-out affordance — same
 *  position/style as Teacher's and Academy's footer (Settings, then Account). */
export const PARENT_NAV_FOOTER: PortalNavItem[] = [
  { href: '/parent/settings', label: 'Settings', icon: Settings },
  { href: '/parent/account', label: 'Account', icon: CircleUser },
];

/** Routes with no rail entry of their own but that still need a resolved
 *  header title — the child-detail pages, reached only via cards on Today. */
const SECONDARY_ROUTES: PortalNavItem[] = [
  { href: '/parent/child', label: 'Child', icon: User },
  { href: '/parent/announcements', label: 'Announcement', icon: Megaphone },
];

const ALL_ITEMS: PortalNavItem[] = [
  ...PARENT_NAV.flatMap((group) => group.items),
  ...PARENT_NAV_FOOTER,
  ...SECONDARY_ROUTES,
];

export { isPortalNavItemActive as isParentNavItemActive };

/** Longest-prefix match, with a special-case for the attendance sub-route
 *  so it resolves to "Attendance" rather than the generic "Child" —
 *  mirrors the batch-workspace special-case anticipated in student-nav.ts. */
export function parentPageTitle(pathname: string): string {
  if (pathname.endsWith('/attendance')) return 'Attendance';
  const match = ALL_ITEMS.filter((item) => isPortalNavItemActive(item, pathname)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.label ?? 'Parent Portal';
}

/** `NotificationsBell`'s `resolveHref` for the Parent Portal — see
 *  studentNotificationHref's doc comment (student-nav.ts) for why this
 *  mapping lives per-portal. Deliberately scoped to just the one new
 *  type this was built for (Academy Dashboard Announcements) — every
 *  other existing notification type Parent already receives keeps
 *  falling through to the existing no-op default. */
export function parentNotificationHref(notification: AppNotification): string | null {
  if (notification.type === 'academy_announcement') {
    const id = notification.payload.announcementId;
    return typeof id === 'string' ? `/parent/announcements/${id}` : null;
  }
  return null;
}
