import {
  BarChart3,
  Bell,
  Building2,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  CircleUser,
  ClipboardCheck,
  GraduationCap,
  Home,
  Images,
  Megaphone,
  MessageCircle,
  NotebookPen,
  Settings,
  ShieldCheck,
  Star,
  UserCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AppNotification } from '@/lib/types';

export interface AcademyNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match on exact pathname only — for index routes like /academy whose
   *  prefix would otherwise swallow every child page. */
  exact?: boolean;
  /** Small numeric pill rendered next to the label (e.g. unread
   *  notification count). Set per-render by the sidebar wrapper, not
   *  baked into the static config below — see academy-sidebar.tsx. */
  badge?: number;
  /** Expandable/collapsible sub-items (Attendance -> Student/Teacher) —
   *  see PortalNavItem.children in portal-sidebar.tsx. */
  children?: AcademyNavItem[];
}

export interface AcademyNavGroup {
  /** Rendered as the small uppercase rail label; undefined for the footer group. */
  label?: string;
  items: AcademyNavItem[];
}

/** The Academy Portal's information architecture, in sidebar order —
 *  mirrors teacher-nav.ts's TEACHER_NAV exactly, just with Academy's own
 *  nav items (see the Navigation, Routing & UX Update spec). */
export const ACADEMY_NAV: AcademyNavGroup[] = [
  {
    label: 'Main',
    items: [
      { href: '/academy', label: 'Today', icon: Home, exact: true },
      { href: '/academy/teachers', label: 'Teachers', icon: Users },
      { href: '/academy/students', label: 'Students', icon: GraduationCap },
      { href: '/academy/parents', label: 'Parents', icon: UserRound },
      { href: '/academy/contact-requests', label: 'Contact Requests', icon: MessageCircle },
    ],
  },
  {
    label: 'Academy',
    items: [
      { href: '/academy/profile', label: 'Academy Profile', icon: Building2 },
      { href: '/academy/verification', label: 'Verification', icon: ShieldCheck },
      { href: '/academy/photos', label: 'Photos', icon: Images },
      { href: '/academy/reviews', label: 'Reviews', icon: Star },
    ],
  },
  {
    label: 'Academic',
    items: [
      { href: '/academy/batches', label: 'Batches', icon: CalendarClock },
      { href: '/academy/timetable', label: 'Timetable', icon: CalendarDays },
      {
        href: '/academy/attendance',
        label: 'Attendance',
        icon: ClipboardCheck,
        children: [
          { href: '/academy/attendance', label: 'Student', icon: ClipboardCheck, exact: true },
          { href: '/academy/attendance/teacher', label: 'Teacher', icon: UserCheck },
        ],
      },
      { href: '/academy/calendar', label: 'Calendar', icon: Calendar },
      { href: '/academy/leave-requests', label: 'Leave Requests', icon: CalendarOff },
      { href: '/academy/holidays', label: 'Holidays', icon: CalendarRange },
      { href: '/academy/assessments', label: 'Assessment', icon: NotebookPen },
    ],
  },
  {
    label: 'Communication',
    items: [
      { href: '/academy/announcements', label: 'Announcements', icon: Megaphone },
      { href: '/academy/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Reports',
    items: [{ href: '/academy/reports', label: 'Reports', icon: BarChart3 }],
  },
];

/** Pinned to the bottom of the rail, above the sign-out affordance — same
 *  position/style as Teacher's footer (Settings, then Account). */
export const ACADEMY_NAV_FOOTER: AcademyNavItem[] = [
  { href: '/academy/settings', label: 'Settings', icon: Settings },
  { href: '/academy/account', label: 'Account', icon: CircleUser },
];

const ALL_ITEMS: AcademyNavItem[] = [
  ...ACADEMY_NAV.flatMap((group) => group.items.flatMap((item) => item.children ?? [item])),
  ...ACADEMY_NAV_FOOTER,
];

export function isAcademyNavItemActive(item: AcademyNavItem, pathname: string): boolean {
  if (item.children) return item.children.some((child) => isAcademyNavItemActive(child, pathname));
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Longest-prefix match so /academy/batches/:id resolves to "Batches"
 *  rather than to the /academy index entry. */
export function academyPageTitle(pathname: string): string {
  const match = ALL_ITEMS.filter((item) => isAcademyNavItemActive(item, pathname)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.label ?? 'Academy Portal';
}

/** Clones ACADEMY_NAV with `count` set on the Notifications item's
 *  `badge` — a pure per-render transform, not baked into the static nav
 *  config, since the count changes independently of navigation. Returns
 *  the original array unchanged when there's nothing to show, so callers
 *  can pass this straight into PortalSidebarConfig either way. */
export function withNotificationsBadge(count: number): AcademyNavGroup[] {
  if (count <= 0) return ACADEMY_NAV;
  return ACADEMY_NAV.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.href === '/academy/notifications' ? { ...item, badge: count } : item,
    ),
  }));
}

/** `NotificationsBell`'s `resolveHref` for the Academy Portal — mirrors
 *  `studentNotificationHref`'s doc comment (student-nav.ts): the same
 *  notification `type` routes differently per portal, so this mapping
 *  lives here rather than inside the shared bell component. Payload
 *  shapes are set server-side by each caller's own `notify()` call
 *  (`academies.service.ts` for the join-request/contact-request types,
 *  `teacher-leave.service.ts` for the leave-request type).
 *
 *  `academy_announcement` deliberately resolves to null — that type only
 *  ever reaches OTHER portals' recipients (teachers/students/parents),
 *  never the academy admin's own feed, since an admin never gets
 *  notified about their own broadcast. */
export function academyNotificationHref(notification: AppNotification): string | null {
  switch (notification.type) {
    case 'academy_join_request':
      return '/academy/teachers';
    case 'teacher_leave_requested':
      return '/academy/leave-requests';
    case 'academy_contact_request_received':
      return '/academy/contact-requests';
    case 'academy_teacher_left':
      return '/academy/teachers';
    case 'academy_verification_approved':
    case 'academy_verification_rejected':
      return '/academy/verification';
    default:
      return null;
  }
}
