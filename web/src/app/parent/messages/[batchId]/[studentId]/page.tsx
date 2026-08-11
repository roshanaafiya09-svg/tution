'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { PageHeader, PageLoading } from '@/components/ui';
import { MessageThread } from '@/components/message-thread';

export default function ParentThreadPage() {
  const { batchId, studentId } = useParams<{ batchId: string; studentId: string }>();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    void api.get<Me>('/auth/me').then(setMe);
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Communication"
        title="Conversation"
        description="Visible to the tutor, your child, and you."
        back={{ href: '/parent/messages', label: 'All conversations' }}
      />
      {me ? <MessageThread batchId={batchId} studentId={studentId} currentUserId={me.id} /> : <PageLoading />}
    </div>
  );
}
