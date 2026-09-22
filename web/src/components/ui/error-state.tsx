'use client';

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/cn';
import { describeApiError, ErrorCodes } from '@/lib/api';
import { teachingContext } from '@/lib/teaching-context';
import { clearCachedFetch } from '@/lib/use-cached-fetch';

export interface ErrorStateProps {
  /** A failed request (normally `query.error`). Title, message, whether Retry
   *  is offered and the reference id are all derived from it centrally — pass
   *  this instead of writing copy. */
  error?: unknown;
  /** Noun phrase for what was being loaded ("your calendar"), woven into the
   *  derived copy. */
  what?: string;
  /** Explicit copy overrides (rare — prefer `error`). */
  title?: string;
  message?: string;
  /** @deprecated alias of `message`, kept so older call sites keep working. */
  description?: string;
  /** Server-side reference to quote to support (derived from `error`). */
  requestId?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  /** Extra action beside Retry. */
  action?: ReactNode;
  /** A one-line inline banner for a single failed widget, not a whole page. */
  compact?: boolean;
  className?: string;
}

/**
 * THE error state. The only thing shown when a request fails — never an empty
 * list, a zero, or "No data yet" (those are `EmptyState`, reserved for a
 * SUCCESSFUL response containing zero records).
 *
 * Shows a title, a message written for the actual failure (a permissions
 * error does not say "check your connection"), a Retry button when trying
 * again could help, and the request reference so the failure can be found in
 * the server logs.
 */
export function ErrorState({
  error,
  what,
  title,
  message,
  description,
  requestId,
  onRetry,
  retryLabel = 'Retry',
  retrying = false,
  action,
  compact = false,
  className,
}: ErrorStateProps) {
  const derived = error === undefined ? null : describeApiError(error, { what });

  const shownTitle = title ?? derived?.title ?? 'Something went wrong';
  const shownMessage = message ?? description ?? derived?.message ?? '';
  const reference = requestId !== undefined ? requestId : (derived?.requestId ?? null);
  const showRetry = Boolean(onRetry) && (derived ? derived.canRetry : true);

  // The two isolation errors that mean "this teaching profile is not usable"
  // are fixed by leaving it — say so with a one-click way out.
  const leavesProfile =
    derived?.code === ErrorCodes.TEACHING_CONTEXT_FORBIDDEN ||
    derived?.code === ErrorCodes.TEACHING_CONTEXT_INVALID;
  const profileAction = leavesProfile ? (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        clearCachedFetch();
        teachingContext.reset();
      }}
    >
      Switch to Individual profile
    </Button>
  ) : null;

  const actions = (
    <>
      {showRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : retryLabel}
        </Button>
      )}
      {profileAction}
      {action}
    </>
  );

  const dataAttrs = {
    'data-error-state': '',
    'data-error-kind': derived?.kind,
    'data-error-code': derived?.code,
  };

  if (compact) {
    return (
      <div
        role="alert"
        {...dataAttrs}
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-error/20 bg-error-bg px-3 py-2.5 text-sm dark:border-error/25 dark:bg-error/10',
          className,
        )}
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-error dark:text-error-dark" aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-neutral-800 dark:text-neutral-100">{shownTitle}</span>
          {shownMessage && (
            <span className="text-neutral-600 dark:text-neutral-400"> — {shownMessage}</span>
          )}
          {reference && (
            <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500">
              Ref <code className="select-all font-mono">{reference}</code>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      {...dataAttrs}
      className={cn(
        'flex flex-col items-center rounded-lg border border-error/20 bg-error-bg px-6 py-10 text-center dark:border-error/25 dark:bg-error/10',
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-error dark:bg-neutral-900 dark:text-error-dark">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <p className="font-medium text-neutral-800 dark:text-neutral-100">{shownTitle}</p>
      {shownMessage && (
        <p className="mt-1 max-w-sm text-sm text-neutral-600 dark:text-neutral-400">{shownMessage}</p>
      )}
      {(showRetry || profileAction || action) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      )}
      {reference && (
        <p className="mt-4 text-xs text-neutral-400 dark:text-neutral-500">
          Reference: <code className="select-all font-mono">{reference}</code>
        </p>
      )}
    </div>
  );
}

/**
 * The failed state of ONE small value (a stat tile, a count): says it could not
 * be loaded and offers Retry — used in place of a number, so a failed request
 * is never shown as "0" or "—". The message and code are on the element for
 * anyone debugging.
 */
export function InlineRetry({
  error,
  what,
  onRetry,
  className,
}: {
  error: unknown;
  what?: string;
  onRetry: () => void;
  className?: string;
}) {
  const derived = describeApiError(error, { what });
  return (
    <button
      type="button"
      onClick={onRetry}
      title={derived.requestId ? `${derived.message} (ref ${derived.requestId})` : derived.message}
      data-error-state=""
      data-error-kind={derived.kind}
      data-error-code={derived.code}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium text-error underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus-ring dark:text-error-dark',
        className,
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      Couldn&apos;t load — Retry
    </button>
  );
}

/** Inline, low-emphasis error line — for form-level submit errors under a button. */
export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-error dark:text-error-dark">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
