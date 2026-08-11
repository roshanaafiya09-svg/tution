import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A chat-style bubble for the Doubts/Help conversation — the student's
 *  question on the right, the tutor/AI's answer on the left, so the page
 *  reads as an approachable back-and-forth rather than a stack of cards. */
export function ConversationTurn({ role, children }: { role: 'question' | 'answer'; children: ReactNode }) {
  return (
    <div className={cn('flex', role === 'question' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[75%]',
          role === 'question'
            ? 'rounded-br-md bg-brand-600 text-white dark:bg-brand-500'
            : 'rounded-bl-md border border-neutral-200/70 bg-white text-neutral-800 dark:border-neutral-800/80 dark:bg-surface dark:text-neutral-100',
        )}
      >
        {children}
      </div>
    </div>
  );
}
