"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold text-neutral-800">
        Something went wrong
      </h1>
      <p className="text-sm text-neutral-500">
        The error has been reported. Try again, or come back later.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
