/** Stand-in for @sentry/nextjs under vitest — records nothing, throws nothing. */
export const addBreadcrumb = () => undefined;
export const captureMessage = () => undefined;
export const captureException = () => undefined;
export const withScope = (fn: (scope: Record<string, () => void>) => void) =>
  fn({ setTag: () => undefined, setFingerprint: () => undefined });
