import {
  BookMarked,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CircleUser,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FolderOpen,
  Globe,
  Home,
  Layers,
  Megaphone,
  MessagesSquare,
  School,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCircle,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AppNotification } from '@/lib/types';

export interface TeacherNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match on exact pathname only — for index routes like /dashboard whose
   *  prefix would otherwise swallow every child page. */
  exact?: boolean;
  /** The teaching profile this page belongs to. Omitted = it works in
   *  either profile (its data is simply scoped to the current one).
   *  'individual' = the teacher's own private business (marketplace
   *  listing, rates, availability, earnings, verification, plan);
   *  'academy' = only meaningful when working under an academy (leave). */
  context?: 'individual' | 'academy';
}

export interface TeacherNavGroup {
  /** Rendered as the small uppercase rail label; undefined for the footer group. */
  label?: string;
  items: TeacherNavItem[];
}

/** The Teacher Portal's information architecture, in sidebar order.
 *  Single source of truth: the sidebar renders it, the header derives the
 *  page title from it, and quick search indexes it. */
export const TEACHER_NAV: TeacherNavGroup[] = [
  {
    label: 'Main',
    items: [
      { href: '/dashboard', label: 'Today', icon: Home, exact: true },
      { href: '/dashboard/batches', label: 'Batches', icon: Layers },
      { href: '/dashboard/students', label: 'Students', icon: Users },
      { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/dashboard/messages', label: 'Messages', icon: MessagesSquare },
    ],
  },
  {
    label: 'Teaching',
    items: [
      { href: '/dashboard/teacher-profile', label: 'Teacher Profile', icon: UserCircle, context: 'individual' },
      { href: '/dashboard/subjects', label: 'Subjects & Rates', icon: BookMarked, context: 'individual' },
      { href: '/dashboard/availability', label: 'Availability', icon: CalendarClock, context: 'individual' },
      { href: '/dashboard/leave', label: 'Leave', icon: CalendarOff, context: 'academy' },
      { href: '/dashboard/materials', label: 'Materials', icon: FolderOpen },
      { href: '/dashboard/assessments', label: 'Assessment', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Business',
    items: [
      { href: '/dashboard/fees', label: 'Fees', icon: Wallet },
      { href: '/dashboard/earnings', label: 'Earnings', icon: TrendingUp, context: 'individual' },
      { href: '/dashboard/marketplace', label: 'Marketplace', icon: Globe, context: 'individual' },
    ],
  },
  {
    label: 'Trust',
    items: [{ href: '/dashboard/verification', label: 'Verification', icon: ShieldCheck, context: 'individual' }],
  },
];

/** Pinned to the bottom of the rail, above the sign-out affordance. */
export const TEACHER_NAV_FOOTER: TeacherNavItem[] = [
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  { href: '/dashboard/profile', label: 'Account', icon: CircleUser },
];

/** Routes that have no rail entry of their own but still need a header
 *  title (and, for the nested ones, an owning section to stay highlighted). */
const SECONDARY_ROUTES: TeacherNavItem[] = [
  { href: '/dashboard/billing', label: 'Subscription & Billing', icon: CreditCard, context: 'individual' },
  { href: '/dashboard/find-an-academy', label: 'Find an Academy', icon: School, context: 'individual' },
  { href: '/dashboard/sessions', label: 'Class', icon: CalendarDays },
  { href: '/dashboard/assignments', label: 'Assignment', icon: FileCheck2 },
  { href: '/dashboard/announcements', label: 'Announcement', icon: Megaphone },
];

const ALL_ITEMS: TeacherNavItem[] = [
  ...TEACHER_NAV.flatMap((group) => group.items),
  ...TEACHER_NAV_FOOTER,
  ...SECONDARY_ROUTES,
];

export function isNavItemActive(item: TeacherNavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The rail for one teaching profile: pages that belong to the other
 *  profile are left out (Individual-only business pages when working under
 *  an academy, and academy-only pages like Leave when working
 *  independently), and groups left empty disappear. */
export function teacherNavFor(kind: 'individual' | 'academy'): TeacherNavGroup[] {
  return TEACHER_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.context || item.context === kind),
  })).filter((group) => group.items.length > 0);
}

/** The profile a page requires, if it belongs to just one — used to stop a
 *  direct link from showing Individual-only pages while working under an
 *  academy (and vice versa). */
export function requiredContextFor(pathname: string): 'individual' | 'academy' | null {
  const match = ALL_ITEMS.filter((item) => isNavItemActive(item, pathname)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.context ?? null;
}

/** Longest-prefix match so /dashboard/batches/:id resolves to "Batches"
 *  rather than to the /dashboard index entry. */
export function teacherPageTitle(pathname: string): string {
  const match = ALL_ITEMS.filter((item) => isNavItemActive(item, pathname)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.label ?? 'Teacher Portal';
}

/** `NotificationsBell`'s `resolveHref` for the Teacher Portal — see
 *  studentNotificationHref's doc comment (student-nav.ts) for why this
 *  mapping lives per-portal rather than in the shared bell component.
 *  Deliberately scoped to just the one new type this was built for
 *  (Academy Dashboard Announcements) rather than retrofitting every
 *  existing notification type Teacher already receives — those keep
 *  falling through to the existing no-op default. */
export function teacherNotificationHref(notification: AppNotification): string | null {
  if (notification.type === 'academy_announcement') {
    const id = notification.payload.announcementId;
    return typeof id === 'string' ? `/dashboard/announcements/${id}` : null;
  }
  if (notification.type === 'assessment_completed') {
    const id = notification.payload.assessmentId;
    const mode = notification.payload.mode === 'online' ? 'online' : 'offline';
    return typeof id === 'string' ? `/dashboard/assessments/${mode}/${id}` : null;
  }
  if (
    notification.type === 'assessment_overdue' ||
    notification.type === 'assessment_scorecard_validation_failed'
  ) {
    const id = notification.payload.assessmentId;
    return typeof id === 'string' ? `/dashboard/assessments/offline/${id}` : null;
  }
  if (notification.type === 'assessment_weekly_reminder') {
    return '/dashboard/assessments';
  }
  return null;
}
