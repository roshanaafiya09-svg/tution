import {
  BookMarked,
  CalendarClock,
  CalendarDays,
  CircleUser,
  CreditCard,
  FileCheck2,
  FolderOpen,
  Globe,
  Home,
  Layers,
  ListChecks,
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

export interface TeacherNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match on exact pathname only — for index routes like /dashboard whose
   *  prefix would otherwise swallow every child page. */
  exact?: boolean;
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
      { href: '/dashboard/teacher-profile', label: 'Teacher Profile', icon: UserCircle },
      { href: '/dashboard/subjects', label: 'Subjects & Rates', icon: BookMarked },
      { href: '/dashboard/availability', label: 'Availability', icon: CalendarClock },
      { href: '/dashboard/materials', label: 'Materials', icon: FolderOpen },
      { href: '/dashboard/quizzes', label: 'Quizzes', icon: ListChecks },
    ],
  },
  {
    label: 'Business',
    items: [
      { href: '/dashboard/fees', label: 'Fees', icon: Wallet },
      { href: '/dashboard/earnings', label: 'Earnings', icon: TrendingUp },
      { href: '/dashboard/marketplace', label: 'Marketplace', icon: Globe },
    ],
  },
  {
    label: 'Trust',
    items: [{ href: '/dashboard/verification', label: 'Verification', icon: ShieldCheck }],
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
  { href: '/dashboard/billing', label: 'Subscription & Billing', icon: CreditCard },
  { href: '/dashboard/find-an-academy', label: 'Find an Academy', icon: School },
  { href: '/dashboard/sessions', label: 'Class', icon: CalendarDays },
  { href: '/dashboard/assignments', label: 'Assignment', icon: FileCheck2 },
];

const ALL_ITEMS: TeacherNavItem[] = [
  ...TEACHER_NAV.flatMap((group) => group.items),
  ...TEACHER_NAV_FOOTER,
  ...SECONDARY_ROUTES,
];

export function isNavItemActive(item: TeacherNavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Longest-prefix match so /dashboard/batches/:id resolves to "Batches"
 *  rather than to the /dashboard index entry. */
export function teacherPageTitle(pathname: string): string {
  const match = ALL_ITEMS.filter((item) => isNavItemActive(item, pathname)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.label ?? 'Teacher Portal';
}
