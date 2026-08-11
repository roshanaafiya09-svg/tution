'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { PageLoading } from '@/components/ui';
import { TeacherPageHeader } from '@/components/dashboard';
import { MessageThread } from '@/components/message-thread';
import { ConversationList } from '@/components/dashboard/conversation-list';

export default function TutorThreadPage() {
  const { batchId, studentId } = useParams<{ batchId: string; studentId: string }>();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    void api.get<Me>('/auth/me').then(setMe);
  }, []);

  return (
    <div>
      <TeacherPageHeader
        eyebrow="Communication"
        title="Conversation"
        description="Visible to the tutor, the student, and any consented parent."
        back={{ href: '/dashboard/messages', label: 'All conversations' }}
      />
      <div className="mt-8 md:grid md:grid-cols-[320px_1fr] md:items-start md:gap-6">
        <div className="hidden md:block">
          <ConversationList activeBatchId={batchId} activeStudentId={studentId} />
        </div>
        <div>
          {me ? <MessageThread batchId={batchId} studentId={studentId} currentUserId={me.id} /> : <PageLoading />}
        </div>
      </div>
    </div>
  );
}
