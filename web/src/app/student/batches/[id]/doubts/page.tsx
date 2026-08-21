'use client';

import { DoubtsPanel, useBatchWorkspace } from '@/components/student';

export default function BatchDoubtsTab() {
  const { batch } = useBatchWorkspace();
  return <DoubtsPanel batchId={batch.id} />;
}
