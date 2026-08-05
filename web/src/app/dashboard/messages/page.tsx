'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { api } from '@/lib/api';
import type { ThreadSummary } from '@/lib/types';
import { Card, PageHeader, EmptyState, PageLoading } from '@/components/ui';

export default function TutorMessagesPage() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);

  useEffect(() => {
    void api.get<ThreadSummary[]>('/messages/mine').then(setThreads);
  }, []);

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Monitored conversations with students and their parents, per batch."
      />

      {threads === null ? (
        <PageLoading />
      ) : threads.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No conversations yet"
          description="Start one from a student's row in a batch's Students tab."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {threads.map((thread) => (
            <Link
              key={`${thread.batch_id}-${thread.student_id}`}
              href={`/dashboard/messages/${thread.batch_id}/${thread.student_id}`}
              className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {thread.student_display_name ?? thread.student_id.slice(0, 8)}
                </p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{thread.batch_title}</p>
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
