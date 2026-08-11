// Teacher Dashboard-only design layer — built on top of the shared
// `@/components/ui` primitives and tokens, kept separate so it never
// affects the Student/Parent/Admin dashboards that share those
// primitives. Mirrors the pattern in `@/components/student` and
// `@/components/parent`.
export { AcademicCard, type AcademicCardProps } from './academic-card';
export { SectionHeader } from './section-header';
export { TeacherPageHeader } from './teacher-page-header';
export { TeacherHero, type DayPeriod } from './teacher-hero';
export { ActionCard } from './action-card';
export { TimelineItem, TimelineDot } from './timeline';
export { ResourceCard } from './resource-card';
export { StatBand, StatBandItem } from './stat-band';
export { ActivityFeed, type ActivityItem } from './activity-feed';
export { SessionCard } from './session-card';
export { StudentCard } from './student-card';
export { ProgressRing } from './progress-ring';
export { TeacherEmptyState } from './teacher-empty-state';
export { OnboardingChecklist } from './onboarding-checklist';
export { ConversationList } from './conversation-list';
