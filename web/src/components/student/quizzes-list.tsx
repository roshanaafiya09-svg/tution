import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { StudentQuizSummary } from '@/lib/types';
import { buttonVariants } from '@/components/ui';
import { AcademicCard, ProgressRing, SectionHeader } from '@/components/student';
import { cn } from '@/lib/cn';

function QuizRow({ quiz, subjectName }: { quiz: StudentQuizSummary; subjectName?: string }) {
  return (
    <Link href={`/student/quizzes/${quiz.id}`}>
      <AcademicCard interactive className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">{quiz.title}</p>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {subjectName ? `${subjectName} · ` : ''}
            {quiz.questionCount} question{quiz.questionCount === 1 ? '' : 's'}
          </p>
        </div>
        {quiz.attempted ? (
          <div className="flex shrink-0 items-center gap-3">
            <ProgressRing
              value={quiz.total ? Math.round(((quiz.score ?? 0) / quiz.total) * 100) : 0}
              size={52}
              strokeWidth={5}
              tone="success"
            >
              <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                {quiz.score}/{quiz.total}
              </span>
            </ProgressRing>
            <span className="hidden text-sm font-medium text-neutral-500 dark:text-neutral-400 sm:inline">View Result</span>
            <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
          </div>
        ) : (
          <span className={cn(buttonVariants({ variant: 'accent', size: 'sm' }), 'pointer-events-none shrink-0')}>
            Start Quiz
          </span>
        )}
      </AcademicCard>
    </Link>
  );
}

/** Available/Completed split for one batch's quiz list — shared by the
 *  global Quizzes page (which wraps it in its own batch-pill selector, one
 *  batch active at a time) and each batch workspace's Quizzes tab (which
 *  renders it directly for its one fixed batch, no pill row needed).
 *  Quizzes are single-attempt take-and-submit (`attempted` is a binary
 *  flag, not a partial-progress state) — there is no real "in progress"
 *  status to model, so this is a 2-way split, not the 3-way one a naive
 *  reading of "Available / In Progress / Completed" might suggest. */
export function QuizzesList({ quizzes, subjectName }: { quizzes: StudentQuizSummary[]; subjectName?: string }) {
  const available = quizzes.filter((q) => !q.attempted);
  const completed = quizzes.filter((q) => q.attempted);

  return (
    <div className="space-y-8">
      {available.length > 0 && (
        <section>
          <SectionHeader title="Available" />
          <div className="space-y-3">
            {available.map((q) => (
              <QuizRow key={q.id} quiz={q} subjectName={subjectName} />
            ))}
          </div>
        </section>
      )}
      {completed.length > 0 && (
        <section>
          <SectionHeader title="Completed" />
          <div className="space-y-3">
            {completed.map((q) => (
              <QuizRow key={q.id} quiz={q} subjectName={subjectName} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
