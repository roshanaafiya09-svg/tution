'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MessagesSquare, Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { ThreadSummary } from '@/lib/types';
import { Card, CardSkeleton, ErrorState, Input, Button } from '@/components/ui';
import { EmptyPanel } from './empty-panel';
import { cn } from '@/lib/cn';

/** Self-contained conversation list — fetches its own threads so it can be
 *  dropped onto both the list page and the thread-detail page (for the
 *  two-column layout) without either owning the fetch. */
export function ConversationList({
  activeBatchId,
  activeStudentId,
}: {
  activeBatchId?: string;
  activeStudentId?: string;
}) {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setLoadError(false);
    setThreads(null);
    api.get<ThreadSummary[]>('/messages/mine').then(setThreads).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return <ErrorState description="Could not load your conversations." onRetry={load} />;
  }

  if (threads === null) {
    return (
      <div className="space-y-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const filtered = threads.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (t.student_display_name ?? '').toLowerCase().includes(q) || t.batch_title.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-3">
      {threads.length > 0 && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="pl-9"
          />
        </div>
      )}

      {threads.length === 0 ? (
        <EmptyPanel
          icon={MessagesSquare}
          title="No conversations yet"
          description="Messages with students and their parents are monitored and grouped per batch. Start one from a student's row in a batch."
          action={
            <Link href="/dashboard/batches">
              <Button variant="secondary" size="sm">
                Go to batches
              </Button>
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
          No conversations match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {filtered.map((thread) => {
            const active = thread.batch_id === activeBatchId && thread.student_id === activeStudentId;
            return (
              <Link
                key={`${thread.batch_id}-${thread.student_id}`}
                href={`/dashboard/messages/${thread.batch_id}/${thread.student_id}`}
                className={cn(
                  'flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
                  active && 'bg-brand-50/70 dark:bg-brand-500/10',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {thread.student_display_name ?? thread.student_id.slice(0, 8)}
                  </p>
                  <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{thread.batch_title}</p>
                </div>
                <p className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                  {new Date(thread.last_message_at).toLocaleDateString('en-IN')}
                </p>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
