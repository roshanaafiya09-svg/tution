'use client';

import { MessagesSquare } from 'lucide-react';
import { TeacherPageHeader } from '@/components/dashboard';
import { ConversationList } from '@/components/dashboard/conversation-list';

export default function TutorMessagesPage() {
  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Communication"
        title="Messages"
        description="Monitored conversations with students and their parents, grouped by batch."
      />

      <div className="md:grid md:grid-cols-[minmax(0,20rem)_1fr] md:items-start md:gap-5">
        <ConversationList />
        <div className="hidden flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 px-6 py-16 text-center md:flex dark:border-neutral-800 dark:bg-neutral-900/40">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-400 shadow-xs dark:bg-neutral-900 dark:text-neutral-500">
            <MessagesSquare className="h-4 w-4" aria-hidden />
          </div>
          <p className="font-medium text-neutral-700 dark:text-neutral-200">Select a conversation</p>
          <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
            Pick someone from the list to read and reply to the thread.
          </p>
        </div>
      </div>
    </div>
  );
}
