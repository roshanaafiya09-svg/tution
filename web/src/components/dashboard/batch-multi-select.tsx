'use client';

import type { Batch } from '@/lib/types';

/** One assessment can be delivered to 1+ authorized batches at once
 *  (spec §4) — this is the shared picker used by both the Online and
 *  Offline assessment creation forms. The backend re-validates every
 *  selected id server-side (getOwnedBatch), so this list is never an
 *  authorization boundary by itself — just the UI for choosing among the
 *  teacher's own batches. */
export function BatchMultiSelect({
  batches,
  selected,
  onChange,
  disabled = false,
}: {
  batches: Batch[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const allSelected = batches.length > 0 && selected.length === batches.length;

  function toggle(id: string) {
    if (disabled) return;
    onChange(selected.includes(id) ? selected.filter((b) => b !== id) : [...selected, id]);
  }

  function toggleAll() {
    if (disabled) return;
    onChange(allSelected ? [] : batches.map((b) => b.id));
  }

  if (batches.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        You have no active batches to select from yet.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800">
      <label className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2.5 text-sm font-medium text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          disabled={disabled}
          className="h-4 w-4 rounded accent-brand-600 dark:accent-brand-400"
        />
        Select All
      </label>
      <ul className="max-h-64 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800">
        {batches.map((batch) => (
          <li key={batch.id}>
            <label className="flex items-center gap-2 px-3 py-2.5 text-sm text-neutral-800 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800/50">
              <input
                type="checkbox"
                checked={selected.includes(batch.id)}
                onChange={() => toggle(batch.id)}
                disabled={disabled}
                className="h-4 w-4 rounded accent-brand-600 dark:accent-brand-400"
              />
              {batch.title}
            </label>
          </li>
        ))}
      </ul>
      <p className="border-t border-neutral-200 px-3 py-2 text-xs text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
        {selected.length} of {batches.length} batch{batches.length === 1 ? '' : 'es'} selected
      </p>
    </div>
  );
}
