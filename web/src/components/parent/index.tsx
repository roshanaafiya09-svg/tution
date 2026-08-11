// Parent Dashboard-only design layer — built on top of the shared
// `@/components/ui` primitives and tokens, kept separate so it never
// affects the Tutor/Admin/Student dashboards that share those primitives.
export { ParentCard, type ParentCardProps } from './parent-card';
export { ParentSectionHeader } from './parent-section-header';
export { ParentHero, type DayPeriod } from './parent-hero';
export { ChildSwitcher, type ChildOption } from './child-switcher';
export { ChildOverviewCard } from './child-overview-card';
export { AttentionCard } from './attention-card';
export { LearningSnapshot, type SnapshotStat } from './learning-snapshot';
export { ActivityFeed, type ActivityItem } from './activity-feed';
export { MessagePreview } from './message-preview';
export { ParentEmptyState } from './parent-empty-state';
export { PremiumStatusCard } from './premium-status-card';
export { ProgressRing } from './progress-ring';
