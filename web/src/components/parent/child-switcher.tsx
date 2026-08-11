import { cn } from '@/lib/cn';

export interface ChildOption {
  studentId: string;
  name: string;
}

/** Horizontal pill switcher for parents with more than one linked child —
 *  selecting a child re-scopes every data-driven section on Home to that
 *  child, using the same `/parent-links/me`-derived list everywhere else
 *  already relies on. Renders nothing for a single child (there's nothing
 *  to switch between). */
export function ChildSwitcher({
  options,
  activeId,
  onSelect,
}: {
  options: ChildOption[];
  activeId: string;
  onSelect: (studentId: string) => void;
}) {
  if (options.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label="Select a child"
      className="flex items-center gap-1.5 overflow-x-auto rounded-full border border-neutral-200/70 bg-white p-1 shadow-xs dark:border-neutral-800/80 dark:bg-surface"
    >
      {options.map((child) => {
        const active = child.studentId === activeId;
        return (
          <button
            key={child.studentId}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(child.studentId)}
            className={cn(
              'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring',
              active
                ? 'bg-brand-600 text-white shadow-xs dark:bg-brand-500 dark:text-neutral-950'
                : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
            )}
          >
            {child.name}
          </button>
        );
      })}
    </div>
  );
}
