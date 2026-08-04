'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { MessageThread } from '@/components/message-thread';

export default function TutorThreadPage() {
  const { batchId, studentId } = useParams<{ batchId: string; studentId: string }>();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    void api.get<Me>('/auth/me').then(setMe);
  }, []);

  return (
    <div>
      <PageHeader title="Conversation" description="Visible to the tutor, the student, and any consented parent." />
      {me && <MessageThread batchId={batchId} studentId={studentId} currentUserId={me.id} />}
    </div>
  );
}
