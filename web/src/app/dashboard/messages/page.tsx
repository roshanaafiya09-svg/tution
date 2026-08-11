'use client';

import { MessagesSquare } from 'lucide-react';
import { TeacherPageHeader } from '@/components/dashboard';
import { ConversationList } from '@/components/dashboard/conversation-list';

export default function TutorMessagesPage() {
  return (
    <div>
      <TeacherPageHeader
        eyebrow="Communication"
        title="Messages"
        description="Monitored conversations with students and their parents, per batch."
      />

      <div className="mt-8 md:grid md:grid-cols-[320px_1fr] md:items-start md:gap-6">
        <ConversationList />
        <div className="hidden flex-col items-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 px-6 py-14 text-center dark:border-neutral-800 dark:bg-neutral-900/40 md:flex">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-400 shadow-xs dark:bg-neutral-900 dark:text-neutral-500">
            <MessagesSquare className="h-5 w-5" aria-hidden />
          </div>
          <p className="font-medium text-neutral-700 dark:text-neutral-200">Select a conversation</p>
          <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
            Choose a conversation from the list to view messages.
          </p>
        </div>
      </div>
    </div>
  );
}
