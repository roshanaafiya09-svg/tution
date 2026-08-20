'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Search, Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch } from '@/lib/types';
import { cn } from '@/lib/cn';
import { inputClass } from '@/components/ui';
import { TEACHER_NAV, TEACHER_NAV_FOOTER, type TeacherNavItem } from './teacher-nav';

interface Result {
  key: string;
  href: string;
  label: string;
  meta: string;
  icon: TeacherNavItem['icon'];
}

const PAGES: TeacherNavItem[] = [...TEACHER_NAV.flatMap((g) => g.items), ...TEACHER_NAV_FOOTER];

/** Header search across the portal's own pages and the teacher's batches
 *  (loaded once, on first focus — no extra request until it's used).
 *  Student names aren't indexed here because they live behind per-batch
 *  requests; the last row hands the query to the Students page instead. */
export function QuickSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadBatches = useCallback(() => {
    if (batches !== null) return;
    void api
      .get<Batch[]>('/batches/me')
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [batches]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const results = useMemo<Result[]>(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const pageHits: Result[] = PAGES.filter((p) => p.label.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((p) => ({ key: `page-${p.href}`, href: p.href, label: p.label, meta: 'Page', icon: p.icon }));
    const batchHits: Result[] = (batches ?? [])
      .filter((b) => b.title.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((b) => ({
        key: `batch-${b.id}`,
        href: `/dashboard/batches/${b.id}`,
        label: b.title,
        meta: b.status === 'active' ? 'Batch' : 'Batch · archived',
        icon: Layers,
      }));
    return [...pageHits, ...batchHits];
  }, [query, batches]);

  function go(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  const studentsHref = `/dashboard/students?q=${encodeURIComponent(query.trim())}`;

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        value={query}
        aria-label="Search Scholar"
        placeholder="Search…"
        onFocus={() => {
          setOpen(true);
          loadBatches();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter') go(results[0]?.href ?? studentsHref);
        }}
        className={cn(inputClass, 'h-9 w-full pl-9 pr-3 [&::-webkit-search-cancel-button]:hidden')}
      />

      {open && query.trim().length > 0 && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-neutral-200 bg-surface-raised p-1 shadow-lg dark:border-neutral-800">
          {results.map((result) => (
            <button
              key={result.key}
              type="button"
              onClick={() => go(result.href)}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <result.icon className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{result.label}</span>
              <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">{result.meta}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => go(studentsHref)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <Users className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              Search students for “{query.trim()}”
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
