'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import {
  TEACHER_NAV,
  TEACHER_NAV_FOOTER,
  isNavItemActive,
  type TeacherNavItem,
} from './teacher-nav';

export const SIDEBAR_WIDTH_EXPANDED = '16rem';
export const SIDEBAR_WIDTH_COLLAPSED = '4.5rem';

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: TeacherNavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isNavItemActive(item, pathname);

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? undefined : item.label}
      className={cn(
        'group relative flex items-center rounded-lg text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus-ring',
        collapsed ? 'h-10 w-10 justify-center' : 'h-9 gap-3 px-3',
        active
          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
          : 'text-neutral-600 hover:bg-neutral-100/80 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-100',
      )}
    >
      {active && !collapsed && (
        <span
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand-500 dark:bg-brand-300"
          aria-hidden
        />
      )}
      <item.icon
        className={cn(
          'h-[18px] w-[18px] shrink-0',
          active ? 'text-brand-600 dark:text-brand-300' : 'text-neutral-400 dark:text-neutral-500',
        )}
        aria-hidden
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarBody({
  collapsed,
  onNavigate,
  onToggleCollapse,
  canToggle,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
  canToggle: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex h-16 shrink-0 items-center',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:shadow-focus-ring"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 font-display text-sm font-semibold italic text-white dark:bg-brand-500 dark:text-neutral-950"
            aria-hidden
          >
            S
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate font-display text-lg font-semibold italic leading-none text-brand-800 dark:text-brand-200">
                Scholar
              </span>
              <span className="mt-1 block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400 dark:text-neutral-500">
                Teacher Portal
              </span>
            </span>
          )}
        </Link>
        {canToggle && !collapsed && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:shadow-focus-ring dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <nav
        aria-label="Teacher portal"
        className={cn(
          'flex-1 overflow-y-auto pb-4',
          collapsed ? 'flex flex-col items-center px-2' : 'px-3',
        )}
      >
        {TEACHER_NAV.map((group, groupIndex) => (
          <div key={group.label ?? groupIndex} className={cn(collapsed && 'flex w-full flex-col items-center')}>
            {collapsed ? (
              groupIndex > 0 && (
                <span className="my-2 h-px w-6 bg-neutral-200 dark:bg-neutral-800" aria-hidden />
              )
            ) : (
              <p
                className={cn(
                  'px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400 dark:text-neutral-500',
                  groupIndex === 0 ? 'pt-1' : 'pt-5',
                )}
              >
                {group.label}
              </p>
            )}
            <ul className={cn('space-y-0.5', collapsed && 'flex flex-col items-center')}>
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className={cn(
          'shrink-0 border-t border-neutral-200/70 py-3 dark:border-neutral-800/80',
          collapsed ? 'flex flex-col items-center gap-0.5 px-2' : 'space-y-0.5 px-3',
        )}
      >
        {TEACHER_NAV_FOOTER.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        {canToggle && collapsed && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            className="mt-1 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100/80 hover:text-neutral-700 focus-visible:outline-none focus-visible:shadow-focus-ring dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

/** Fixed rail for tablet and desktop. Tablet keeps it permanently collapsed
 *  (icons only) — `canToggle` is false there. */
export function TeacherSidebar({
  collapsed,
  onToggleCollapse,
  canToggle,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  canToggle: boolean;
}) {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden border-r border-neutral-200/70 bg-background md:block dark:border-neutral-800/80"
      style={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
    >
      <SidebarBody collapsed={collapsed} onToggleCollapse={onToggleCollapse} canToggle={canToggle} />
    </aside>
  );
}

/** Slide-out drawer for mobile. */
export function TeacherSidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 bg-neutral-950/40 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] border-r border-neutral-200 bg-background shadow-lg duration-base animate-in slide-in-from-left focus:outline-none dark:border-neutral-800"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="absolute right-3 top-5 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <SidebarBody collapsed={false} onNavigate={onClose} canToggle={false} />
      </div>
    </div>
  );
}
