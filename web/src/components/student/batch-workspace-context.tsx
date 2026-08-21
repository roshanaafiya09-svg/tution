'use client';

import { createContext, useContext } from 'react';
import type { Batch, Subject } from '@/lib/types';

export interface BatchWorkspaceValue {
  batch: Batch;
  subjectName?: string;
  /** The full catalog subjects list — handed down so sub-pages that need
   *  to resolve subject names for data outside this one batch (none
   *  currently do, but `ScheduleList` etc. take a `subjects` array for
   *  parity with the global pages) don't have to re-fetch it themselves. */
  subjects: Subject[];
}

export const BatchWorkspaceContext = createContext<BatchWorkspaceValue | null>(null);

/** Gives every batch-workspace sub-page the resolved batch (and catalog
 *  subjects) without each one re-fetching `/batches/enrolled` — the layout
 *  fetches it once and finds the matching batch by id. Lives outside
 *  `app/student/batches/[id]/layout.tsx` because Next.js's App Router only
 *  allows a fixed set of named exports (default, metadata, ...) from a
 *  `layout.tsx` file — anything else fails the build's route-type check. */
export function useBatchWorkspace(): BatchWorkspaceValue {
  const ctx = useContext(BatchWorkspaceContext);
  if (!ctx) throw new Error('useBatchWorkspace must be used within the batch workspace layout');
  return ctx;
}
