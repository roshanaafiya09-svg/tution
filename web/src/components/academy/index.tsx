// Academy Dashboard-only design layer — built on top of the shared
// `@/components/ui` primitives and tokens, kept separate so it never
// affects the Tutor/Student/Parent/Admin dashboards that share those
// primitives. Mirrors the pattern in `@/components/student`/`@/components/dashboard`.
export { AcademyCard, type AcademyCardProps } from './academy-card';
export { AcademySectionHeader } from './academy-section-header';
export { AcademyPageIntro } from './academy-page-intro';
export { AcademyHero, type DayPeriod } from './academy-hero';
