"use client";
import Link from "next/link";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="route-loading">
      <h1>This page needs another take.</h1>
      <p>Your work is saved.</p>
      <div className="button-row">
        <button className="button button-primary" onClick={reset}>
          Try again
        </button>
        <Link className="button" href="/productions">
          My productions
        </Link>
      </div>
    </main>
  );
}
