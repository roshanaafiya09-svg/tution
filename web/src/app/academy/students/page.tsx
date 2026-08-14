import { GraduationCap } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { AcademyPageIntro } from '@/components/academy';

export default function AcademyStudentsPage() {
  return (
    <div>
      <AcademyPageIntro eyebrow="Academy Dashboard" title="Students" description="Students taught across your academy's teachers." />
      <div className="mt-8">
        <EmptyState
          icon={GraduationCap}
          title="Coming soon"
          description="Batch and student management isn't part of the Academy Dashboard yet — your teachers' students stay managed from their own Teacher Dashboards. Come back once academy-level scheduling ships."
        />
      </div>
    </div>
  );
}
