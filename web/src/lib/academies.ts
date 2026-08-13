import type { TeachingMode } from './types';

/**
 * Mirrors discovery.ts exactly, applied to GET /marketplace/academies
 * instead of /marketplace/discovery/tutors — shared by the student and
 * parent Find an Academy list pages.
 */
export interface AcademySearchFilters {
  subjectId?: string;
  curriculumId?: string;
  grade?: string;
  teachingMode?: TeachingMode | '';
  minRating?: string;
}

export function buildAcademySearchParams(
  filters: AcademySearchFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.subjectId) params.set('subjectId', filters.subjectId);
  if (filters.curriculumId) params.set('curriculumId', filters.curriculumId);
  if (filters.grade) params.set('grade', filters.grade);
  if (filters.teachingMode) params.set('teachingMode', filters.teachingMode);
  if (filters.minRating) params.set('minRating', filters.minRating);
  return params;
}

export function academyInitials(name: string | null): string {
  if (!name) return 'A';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
