/** The mark: three retrieval lanes converging on a single answer at the edge.
 *  The two upper lanes are the dense and sparse retrievers; they narrow into
 *  one grounded result. */
import { cx } from "../ui";

export function Mark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cx("shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" className="fill-raised" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" className="stroke-line-strong" strokeWidth="1" />
      <path d="M8.5 9.5h13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
      <path d="M8.5 16h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.5" />
      <path d="M8.5 22.5h13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
      <circle cx="22" cy="16" r="3.2" className="fill-accent" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("select-none whitespace-nowrap", className)}>
      <span className="font-semibold tracking-[-0.02em]">Edge</span>
      <span className="font-normal tracking-[-0.01em] text-muted">RAG</span>
    </span>
  );
}

/** Mark and wordmark together, at the size used in headers and the sidebar. */
export function Lockup({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <span className={cx("inline-flex items-center gap-2 text-fg", className)}>
      <Mark size={size} />
      <Wordmark className="text-[15px]" />
    </span>
  );
}
