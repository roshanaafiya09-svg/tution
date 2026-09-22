'use client';

import { MessagesSquare } from 'lucide-react';
import { api } from '@/lib/api';
import type { AppNotification, ThreadSummary } from '@/lib/types';
import { PageHeader, EmptyState, CardSkeleton, ErrorState, QueryBoundary } from '@/components/ui';
import { useApiQuery } from '@/lib/query';
import { MessagePreview } from '@/components/parent';

export default function ParentMessagesPage() {
  const threadsQuery = useApiQuery(() => api.get<ThreadSummary[]>('/messages/mine'), []);
  // Only drives the "unread" dots. If it fails we say so instead of showing
  // every conversation as read.
  const notificationsQuery = useApiQuery(() => api.get<AppNotification[]>('/notifications'), []);
  const notifications = notificationsQuery.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Communication"
        title="Messages"
        description="Monitored conversations with your child's tutor."
      />

      {notificationsQuery.status === 'error' && (
        <ErrorState
          compact
          className="mb-3"
          error={notificationsQuery.error}
          what="your unread message indicators"
          onRetry={() => void notificationsQuery.reload()}
        />
      )}

      <QueryBoundary
        query={threadsQuery}
        what="your conversations"
        loading={
          <div className="space-y-3">
            <CardSkeleton className="rounded-2xl" />
            <CardSkeleton className="rounded-2xl" />
          </div>
        }
        empty={
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            description="Tutor conversations will appear here once your child's tutor starts one."
          />
        }
      >
        {(threads) => (
        <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:divide-neutral-800/80 dark:border-neutral-800/80 dark:bg-surface">
          {[...threads]
            .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
            .map((thread) => {
              const unread = notifications.some(
                (n) =>
                  n.type === 'new_message' &&
                  !n.read_at &&
                  (n.payload as { batchId?: string; studentId?: string }).batchId === thread.batch_id &&
                  (n.payload as { batchId?: string; studentId?: string }).studentId === thread.student_id,
              );
              return (
                <MessagePreview
                  key={`${thread.batch_id}-${thread.student_id}`}
                  href={`/parent/messages/${thread.batch_id}/${thread.student_id}`}
                  studentName={thread.student_display_name ?? `Student ${thread.student_id.slice(0, 8)}`}
                  batchTitle={thread.batch_title}
                  lastMessageAt={thread.last_message_at}
                  unread={unread}
                />
              );
            })}
        </div>
        )}
      </QueryBoundary>
    </div>
  );
}
