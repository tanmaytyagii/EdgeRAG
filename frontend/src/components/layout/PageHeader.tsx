import type React from "react";
import { cx } from "../ui";

/** Every page opens the same way: one h1, an optional sentence of context, and
 *  the page's primary actions on the right. Actions wrap beneath the title on
 *  narrow screens rather than squeezing it. */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  sticky = true,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Compact status shown under the title — badges, counts, timestamps. */
  meta?: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <div
      className={cx(
        "border-b border-line bg-ink/85 py-4 backdrop-blur",
        sticky && "sticky top-0 z-30",
      )}
    >
      <div className="shell shell-workspace flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-page-title font-semibold text-fg">{title}</h1>
          {description && (
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-muted">{description}</p>
          )}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** The standard page body: one max width, one rhythm, applied everywhere so
 *  pages line up with each other. */
export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("shell shell-workspace py-5", className)}>{children}</div>;
}
