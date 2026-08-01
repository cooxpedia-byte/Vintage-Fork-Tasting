"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="page-shell"><div className="empty-state"><h1>Something went wrong.</h1><p>The error was logged. Nothing was changed.</p><button className="btn btn-primary" onClick={reset}>Try again</button></div></main>;
}
