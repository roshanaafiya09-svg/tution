// Student Dashboard-only design layer — built on top of the shared
// `@/components/ui` primitives and tokens, kept separate so it never
// affects the Tutor/Admin/Parent dashboards that share those primitives.
export { AcademicCard, type AcademicCardProps } from './academic-card';
export { SectionHeader } from './section-header';
export { StatBand, StatBandItem } from './stat-band';
export { ActionCard } from './action-card';
export { HeroPanel, type DayPeriod } from './hero-panel';
export { TimelineNode, TimelineDot } from './timeline';
export { PageIntro } from './page-intro';
export { ResourceCard } from './resource-card';
export { ProgressRing } from './progress-ring';
export { ConversationTurn } from './conversation-turn';
export { ScheduleList } from './schedule-list';
export { AssignmentsList, statusFor, type AssignmentStatus } from './assignments-list';
export { MaterialsList, type MaterialWithBatch } from './materials-list';
export { QuizzesList } from './quizzes-list';
export { AttendanceCalendar } from './attendance-calendar';
export { AttendanceDetail, type HistoryRowWithBatch } from './attendance-detail';
export { AnnouncementsList, type AnnouncementWithBatch } from './announcements-list';
export { DoubtsPanel } from './doubts-panel';
export { useBatchWorkspace, BatchWorkspaceContext, type BatchWorkspaceValue } from './batch-workspace-context';
export { NoBatchesEmptyState } from './no-batches-empty-state';
