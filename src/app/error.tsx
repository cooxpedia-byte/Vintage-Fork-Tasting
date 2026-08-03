"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return <main className="page-shell"><div className="empty-state"><h1>Something went wrong.</h1><p>The error was logged. Nothing was changed.</p><button className="btn btn-primary btn-attention" onClick={reset}>Try again</button></div></main>;
}
