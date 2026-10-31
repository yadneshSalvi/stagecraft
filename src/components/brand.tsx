import Link from "next/link";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand ${compact ? "brand-compact" : ""}`}
      aria-label="STAGECRAFT home"
    >
      <svg
        viewBox="0 0 32 38"
        width="28"
        height="34"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 34V15C4 7.82 9.37 2 16 2s12 5.82 12 13v19M10 34V16c0-4.97 2.69-9 6-9s6 4.03 6 9v18M1 35h30M15 18h2v17"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      {!compact && (
        <span>
          STAGECRAFT<span className="brand-tag">THE PRODUCTION WORKSPACE</span>
        </span>
      )}
    </Link>
  );
}
