'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { ThreadMessage } from '@/lib/types';
import { Card, Button, Input, InlineError, EmptyState, Skeleton } from '@/components/ui';

const ROLE_LABELS: Record<string, string> = { tutor: 'Tutor', student: 'Student', parent: 'Parent' };

export function MessageThread({
  batchId,
  studentId,
  currentUserId,
}: {
  batchId: string;
  studentId: string;
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setMessages(await api.get<ThreadMessage[]>(`/messages/batch/${batchId}/student/${studentId}`));
  }, [batchId, studentId]);

  useEffect(() => {
    load().catch(() => setError('Could not load this conversation.'));
  }, [load]);

  useEffect(() => {
    if (messages && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages]);

  async function send() {
    if (!body.trim()) return;
    setError(null);
    setSending(true);
    try {
      await api.post(`/messages/batch/${batchId}/student/${studentId}`, { body });
      setBody('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send that message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      {messages === null ? (
        <Card className="mb-4 flex max-h-[60vh] flex-col gap-3">
          <Skeleton className="h-10 w-2/3 self-start rounded-lg" />
          <Skeleton className="h-10 w-1/2 self-end rounded-lg" />
          <Skeleton className="h-10 w-3/5 self-start rounded-lg" />
        </Card>
      ) : (
        <Card className="mb-4 flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState title="No messages yet" description="Say hello to start the conversation." />
          ) : (
            <>
              {messages.map((message) => {
                const mine = message.sender_id === currentUserId;
                return (
                  <div key={message.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                        mine
                          ? 'bg-brand-600 text-white dark:bg-brand-500'
                          : 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                      }`}
                    >
                      {message.body}
                    </div>
                    <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                      {message.sender_display_name ?? ROLE_LABELS[message.sender_role]} ·{' '}
                      {new Date(message.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </>
          )}
        </Card>
      )}

      {error && <div className="mb-2"><InlineError>{error}</InlineError></div>}

      <div className="flex gap-2">
        <Input
          className="flex-1"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          placeholder="Type a message…"
        />
        <Button onClick={() => void send()} disabled={sending || !body.trim()} loading={sending}>
          <Send className="h-4 w-4" aria-hidden />
          Send
        </Button>
      </div>
    </div>
  );
}
