'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { ThreadMessage } from '@/lib/types';
import { Card, Button, inputClass } from '@/components/ui';

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

  const load = useCallback(async () => {
    setMessages(await api.get<ThreadMessage[]>(`/messages/batch/${batchId}/student/${studentId}`));
  }, [batchId, studentId]);

  useEffect(() => {
    load().catch(() => setError('Could not load this conversation.'));
  }, [load]);

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
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <Card className="mb-4 flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-sm text-neutral-500">No messages yet — say hello.</p>
          ) : (
            messages.map((message) => {
              const mine = message.sender_id === currentUserId;
              return (
                <div key={message.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                      mine ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-900'
                    }`}
                  >
                    {message.body}
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
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
            })
          )}
        </Card>
      )}

      {error && <p className="mb-2 text-sm text-error">{error}</p>}

      <div className="flex gap-2">
        <input
          className={`${inputClass} flex-1`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          placeholder="Type a message…"
        />
        <Button onClick={() => void send()} disabled={sending || !body.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
