'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, GraduationCap, Heart } from 'lucide-react';
import { api } from '@/lib/api';
import type { AdminTeacherSummary, AdminStudentSummary, AdminParentSummary } from '@/lib/types';
import { PageHeader, Card, CardTitle, CardDescription, PageLoading } from '@/components/ui';

const CARDS = [
  {
    href: '/admin/teachers',
    label: 'Teachers',
    icon: Users,
    key: 'teachers' as const,
  },
  {
    href: '/admin/students',
    label: 'Students',
    icon: GraduationCap,
    key: 'students' as const,
  },
  {
    href: '/admin/parents',
    label: 'Parents',
    icon: Heart,
    key: 'parents' as const,
  },
];

export default function AdminDashboardPage() {
  const [counts, setCounts] = useState<{ teachers: number; students: number; parents: number } | null>(
    null,
  );

  useEffect(() => {
    void Promise.all([
      api.get<AdminTeacherSummary[]>('/admin/teachers'),
      api.get<AdminStudentSummary[]>('/admin/students'),
      api.get<AdminParentSummary[]>('/admin/parents'),
    ]).then(([teachers, students, parents]) => {
      setCounts({ teachers: teachers.length, students: students.length, parents: parents.length });
    });
  }, []);

  return (
    <div>
      <PageHeader
        title="Super Admin Dashboard"
        description="Manage teacher, student, and parent accounts across the platform."
      />

      {counts === null ? (
        <PageLoading />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {CARDS.map((card) => (
            <Link key={card.key} href={card.href}>
              <Card interactive className="h-full">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                    <card.icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <CardTitle>{card.label}</CardTitle>
                    <CardDescription className="mt-0">{counts[card.key]} accounts</CardDescription>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
