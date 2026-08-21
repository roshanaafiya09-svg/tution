import type { DiscoverySortMode, TeachingMode } from './types';

/**
 * Shared by the public /discover page and the authenticated Find a
 * Teacher pages (student/parent dashboards) — one place that knows how
 * to turn filter state into the query string GET
 * /marketplace/discovery/tutors expects, instead of three near-identical
 * copies of this URLSearchParams-building logic.
 */
export interface TutorSearchFilters {
  subjectId?: string;
  curriculumId?: string;
  grade?: string;
  language?: string;
  teachingMode?: TeachingMode | '';
  minExperience?: string;
  feeMaxMinor?: string;
  minRating?: string;
  sort?: DiscoverySortMode | '';
}

export function buildTutorSearchParams(filters: TutorSearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.subjectId) params.set('subjectId', filters.subjectId);
  if (filters.curriculumId) params.set('curriculumId', filters.curriculumId);
  if (filters.grade) params.set('grade', filters.grade);
  if (filters.language) params.set('language', filters.language);
  if (filters.teachingMode) params.set('teachingMode', filters.teachingMode);
  if (filters.minExperience) params.set('minExperience', filters.minExperience);
  if (filters.feeMaxMinor) params.set('feeMaxMinor', filters.feeMaxMinor);
  if (filters.minRating) params.set('minRating', filters.minRating);
  if (filters.sort) params.set('sort', filters.sort);
  return params;
}

export function tutorInitials(name: string | null): string {
  if (!name) return 'T';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
