import { ms, stageLabels } from "../../lib/format";
import type { Stage } from "../../lib/types";
import { cx } from "../ui";

const COLORS: Record<string, string> = {
  query_processing: "bg-faint",
  dense_retrieval: "bg-dense",
  sparse_retrieval: "bg-sparse",
  hybrid_fusion: "bg-both",
  reranking: "bg-accent/60",
  generation: "bg-fg/70",
};

/** Compact latency breakdown. Segment widths are proportional to measured time,
 *  so the bar shows where a slow query actually spent it. */
export function StageStrip({
  stages,
  totalMs,
  className,
}: {
  stages: Stage[];
  totalMs: number;
  className?: string;
}) {
  const measured = stages.filter((stage) => stage.duration_ms > 0);
  const sum = measured.reduce((total, stage) => total + stage.duration_ms, 0) || 1;

  if (measured.length === 0) return null;

  return (
    <div className={className}>
      <div
        className="flex h-1.5 gap-px overflow-hidden rounded-full bg-raised"
        role="img"
        aria-label={`Latency breakdown, ${ms(totalMs)} total: ${measured
          .map((stage) => `${stageLabels[stage.name] ?? stage.name} ${ms(stage.duration_ms)}`)
          .join(", ")}`}
      >
        {measured.map((stage) => (
          <span
            key={stage.name}
            /* A tooltip component cannot carry the proportional width, so the
               per-segment hint stays a native title. */
            title={`${stageLabels[stage.name] ?? stage.name}: ${ms(stage.duration_ms)}`}
            className={cx("block h-1.5", COLORS[stage.name] ?? "bg-muted")}
            style={{ width: `${(stage.duration_ms / sum) * 100}%` }}
          />
        ))}
      </div>

      <dl className="mt-2.5 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        {measured.map((stage) => (
          <div key={stage.name} className="flex items-baseline justify-between gap-2">
            <dt className="flex min-w-0 items-center gap-1.5 truncate text-2xs text-muted">
              <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", COLORS[stage.name] ?? "bg-muted")} />
              {stageLabels[stage.name] ?? stage.name}
            </dt>
            <dd className="shrink-0 font-mono text-2xs text-fg tnum">{ms(stage.duration_ms)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
