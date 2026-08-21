import {
  BookMarked,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarClock,
  FileCheck2,
  HelpCircle,
  Home,
  ListChecks,
  Megaphone,
  Search,
  User,
  type LucideIcon,
} from 'lucide-react';
import { isPortalNavItemActive, type PortalNavGroup, type PortalNavItem } from './portal-sidebar';
import type { AppNotification } from '@/lib/types';

/** The Student Portal's information architecture, in sidebar order — see
 *  the Student Dashboard Side Navigation & UX Redesign spec §1/§20. */
export const STUDENT_NAV: PortalNavGroup[] = [
  {
    label: 'Main',
    items: [{ href: '/student', label: 'Overview', icon: Home, exact: true }],
  },
  {
    label: 'Discover',
    items: [
      { href: '/student/find-a-teacher', label: 'Find a Teacher', icon: Search },
      { href: '/student/find-an-academy', label: 'Find an Academy', icon: Building2 },
    ],
  },
  {
    label: 'My Learning',
    items: [
      { href: '/student/batches', label: 'My Batches', icon: BookMarked },
      { href: '/student/schedule', label: 'Schedule', icon: CalendarClock },
      { href: '/student/assignments', label: 'Assignments', icon: FileCheck2 },
      { href: '/student/quizzes', label: 'Quizzes', icon: ListChecks },
      { href: '/student/materials', label: 'Materials', icon: BookOpen },
    ],
  },
  {
    label: 'Progress',
    items: [
      { href: '/student/attendance', label: 'Attendance', icon: CalendarCheck },
      { href: '/student/announcements', label: 'Announcements', icon: Megaphone },
      { href: '/student/doubts', label: 'Doubts & Help', icon: HelpCircle },
    ],
  },
];

/** Pinned to the bottom of the rail, above the sign-out affordance. No
 *  Settings entry — there is no /student/settings page and no defined
 *  content for one yet. Add it here (mirroring ACADEMY_NAV_FOOTER) once a
 *  real settings page exists; nothing else needs to change to support it. */
export const STUDENT_NAV_FOOTER: PortalNavItem[] = [
  { href: '/student/profile', label: 'Profile', icon: User },
];

/** Routes with no rail entry of their own but that still need a resolved
 *  header title (and an owning section to stay highlighted). Every current
 *  detail route (/student/assignments/:id, /student/quizzes/:id,
 *  /student/find-a-teacher/:slug, /student/find-an-academy/:slug) already
 *  falls under a flat nav item's own prefix match, so nothing needs listing
 *  here yet. The batch workspace (/student/batches/:id/...) will need its
 *  title resolved from live batch data instead of a static label — see
 *  studentPageTitle's batch-workspace special-case, added once that route
 *  exists. */
const SECONDARY_ROUTES: PortalNavItem[] = [];

const ALL_ITEMS: PortalNavItem[] = [
  ...STUDENT_NAV.flatMap((group) => group.items),
  ...STUDENT_NAV_FOOTER,
  ...SECONDARY_ROUTES,
];

export { isPortalNavItemActive as isStudentNavItemActive };
export type { LucideIcon };

/** Longest-prefix match so e.g. /student/assignments/:id resolves to
 *  "Assignment" rather than the flat "Assignments" list entry. */
export function studentPageTitle(pathname: string): string {
  const match = ALL_ITEMS.filter((item) => isPortalNavItemActive(item, pathname)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.label ?? 'Student Portal';
}

/** `NotificationsBell`'s `resolveHref` for the Student Portal. The same
 *  notification `type` routes differently per portal (a tutor's
 *  `announcement` goes to their own batch detail page), so this mapping
 *  lives here rather than inside the shared bell component — see its own
 *  `resolveHref` doc comment. Payload shapes are set server-side by each
 *  module's own `notify()` call (`assessment.service.ts`,
 *  `quizzes.service.ts`, `announcements.service.ts`). */
export function studentNotificationHref(notification: AppNotification): string | null {
  const payload = notification.payload;
  switch (notification.type) {
    case 'assignment_created':
    case 'submission_graded':
      return typeof payload.assignmentId === 'string' ? `/student/assignments/${payload.assignmentId}` : null;
    case 'quiz_published':
      return typeof payload.quizId === 'string' ? `/student/quizzes/${payload.quizId}` : null;
    case 'announcement':
      return typeof payload.batchId === 'string'
        ? `/student/batches/${payload.batchId}/announcements`
        : '/student/announcements';
    default:
      return null;
  }
}
