'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { api } from '@/lib/api';
import type { ThreadSummary } from '@/lib/types';
import { Card, PageHeader, EmptyState, PageLoading } from '@/components/ui';

export default function ParentMessagesPage() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);

  useEffect(() => {
    void api.get<ThreadSummary[]>('/messages/mine').then(setThreads);
  }, []);

  return (
    <div>
      <PageHeader title="Messages" description="Monitored conversations with your child's tutor." />

      {threads === null ? (
        <PageLoading />
      ) : threads.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No conversations yet"
          description="Conversations your child's tutor starts with you will show up here."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {threads.map((thread) => (
            <Link
              key={`${thread.batch_id}-${thread.student_id}`}
              href={`/parent/messages/${thread.batch_id}/${thread.student_id}`}
              className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {thread.batch_title}
                </p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {thread.student_display_name ?? `Student ${thread.student_id.slice(0, 8)}`}
                </p>
              </div>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                {new Date(thread.last_message_at).toLocaleDateString('en-IN')}
              </p>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
