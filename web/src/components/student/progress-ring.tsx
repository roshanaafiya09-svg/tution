import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const STROKE_TONE = {
  brand: 'stroke-brand-500 dark:stroke-brand-400',
  success: 'stroke-success dark:stroke-success-dark',
  warning: 'stroke-warning dark:stroke-warning-dark',
  error: 'stroke-error dark:stroke-error-dark',
} as const;

/** A circular progress indicator — Attendance's signature device instead
 *  of a flat percentage bar. `value` is 0-100, or null for "no data yet"
 *  (renders an empty track only, never a fabricated position). */
export function ProgressRing({
  value,
  size = 132,
  strokeWidth = 10,
  tone = 'brand',
  children,
}: {
  value: number | null;
  size?: number;
  strokeWidth?: number;
  tone?: keyof typeof STROKE_TONE;
  children?: ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = value === null ? circumference : circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="presentation">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-neutral-100 dark:stroke-neutral-800"
        />
        {value !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn('fill-none transition-all duration-slow', STROKE_TONE[tone])}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
