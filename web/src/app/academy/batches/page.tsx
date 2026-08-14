import { CalendarClock } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { AcademyPageIntro } from '@/components/academy';

export default function AcademyBatchesPage() {
  return (
    <div>
      <AcademyPageIntro eyebrow="Academy Dashboard" title="Batches" description="Batches run by your academy's teachers." />
      <div className="mt-8">
        <EmptyState
          icon={CalendarClock}
          title="Coming soon"
          description="Batch and student management isn't part of the Academy Dashboard yet — your teachers' batches stay managed from their own Teacher Dashboards. Come back once academy-level scheduling ships."
        />
      </div>
    </div>
  );
}
