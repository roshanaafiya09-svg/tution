'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyOwnerProfile, Review, ReviewSummary } from '@/lib/types';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupRequired } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

export default function AcademyReviewsPage() {
  const { hasAcademy } = useAcademyDashboard();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (hasAcademy === false) return;
    setLoadError(false);
    try {
      const profile = await api.get<AcademyOwnerProfile>('/academy/me');
      const res = await api.get<{ reviews: Review[]; summary: ReviewSummary }>(
        `/marketplace/academy-reviews/academy/${profile.id}`,
      );
      setReviews(res.reviews);
      setSummary(res.summary);
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews?.filter((r) => r.rating === star).length ?? 0,
  }));
  const maxCount = Math.max(1, ...distribution.map((d) => d.count));

  return (
    <div>
      <AcademyPageIntro eyebrow="Academy Dashboard" title="Reviews" description="What students say about your academy." />

      <div className="mt-8">
        {hasAcademy === false ? (
          <AcademySetupRequired pageLabel="Reviews" />
        ) : loadError ? (
          <ErrorState description="Could not load reviews. Check your connection and try again." onRetry={() => void load()} />
        ) : reviews === null || summary === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <>
            <AcademyCard className="mb-6">
              <div className="flex flex-wrap items-center gap-8">
                <div>
                  <p className="font-display text-4xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {summary.average ?? '—'}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
                    <Star className="h-3.5 w-3.5 fill-accent-400 text-accent-400" aria-hidden />
                    {summary.count} review{summary.count === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="min-w-[12rem] flex-1 space-y-1.5">
                  {distribution.map((d) => (
                    <div key={d.star} className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <span className="w-8 shrink-0">{d.star} ★</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <div
                          className="h-full rounded-full bg-accent-400"
                          style={{ width: `${(d.count / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </AcademyCard>

            {reviews.length === 0 ? (
              <EmptyState icon={Star} title="No reviews yet" description="Reviews from verified students will appear here." />
            ) : (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <AcademyCard key={review.id}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {review.student_display_name ?? 'Student'}
                      </p>
                      <p className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                        <Star className="h-3.5 w-3.5 fill-accent-400 text-accent-400" aria-hidden />
                        {review.rating}
                      </p>
                    </div>
                    {review.comment && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{review.comment}</p>}
                    <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                      {new Date(review.created_at).toLocaleDateString()}
                    </p>
                  </AcademyCard>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
