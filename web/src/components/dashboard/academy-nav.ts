import {
  Building2,
  CalendarClock,
  CircleUser,
  GraduationCap,
  Home,
  Images,
  MessageCircle,
  Settings,
  ShieldCheck,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface AcademyNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match on exact pathname only — for index routes like /academy whose
   *  prefix would otherwise swallow every child page. */
  exact?: boolean;
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
    label: 'Classes',
    items: [
      { href: '/academy/batches', label: 'Batches', icon: CalendarClock },
      { href: '/academy/students', label: 'Students', icon: GraduationCap },
    ],
  },
];

/** Pinned to the bottom of the rail, above the sign-out affordance — same
 *  position/style as Teacher's footer (Settings, then Account). */
export const ACADEMY_NAV_FOOTER: AcademyNavItem[] = [
  { href: '/academy/settings', label: 'Settings', icon: Settings },
  { href: '/academy/account', label: 'Account', icon: CircleUser },
];

const ALL_ITEMS: AcademyNavItem[] = [
  ...ACADEMY_NAV.flatMap((group) => group.items),
  ...ACADEMY_NAV_FOOTER,
];

export function isAcademyNavItemActive(item: AcademyNavItem, pathname: string): boolean {
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
