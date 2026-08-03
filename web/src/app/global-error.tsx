"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Root-layout-level boundary — replaces the entire app on a crash there,
// so it must render its own <html><body> and stay maximally simple
// (no design-system imports that could themselves be part of the crash).
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p>The error has been reported. Please refresh the page.</p>
        </div>
      </body>
    </html>
  );
}
