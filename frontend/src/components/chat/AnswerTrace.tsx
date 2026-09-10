import { useState } from "react";
import { ms, percent } from "../../lib/format";
import type { Candidate, Confidence, Trace } from "../../lib/types";
import { StageStrip } from "../retrieval/StageStrip";
import { CandidateRow } from "../retrieval/CandidateRow";
import { Badge, Icon, cx } from "../ui";

/** "How this answer was generated" — the disclosure that makes EdgeRAG's
 *  retrieval legible rather than a black box. Every value shown here was
 *  measured by the backend for this specific query. */
export function AnswerTrace({
  trace,
  confidence,
  candidates,
  onOpenCandidate,
}: {
  trace: Trace | null;
  confidence?: Confidence | null;
  candidates?: Candidate[];
  onOpenCandidate?: (candidate: Candidate) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!trace) return null;

  const dense = trace.stages.find((s) => s.name === "dense_retrieval")?.metrics ?? {};
  const sparse = trace.stages.find((s) => s.name === "sparse_retrieval")?.metrics ?? {};
  const fusion = trace.stages.find((s) => s.name === "hybrid_fusion")?.metrics ?? {};
  const rerank = trace.stages.find((s) => s.name === "reranking")?.metrics ?? {};

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cx(
          "flex items-center gap-1.5 rounded text-2xs text-muted transition-colors duration-150 hover:text-fg",
        )}
      >
        <Icon
          name="chevronRight"
          size={12}
          className={cx("transition-transform duration-200 ease-edge", open && "rotate-90")}
        />
        How this answer was generated
        <span className="font-mono text-faint tnum">{ms(trace.total_ms)}</span>
      </button>

      {open && (
        <div className="mt-2.5 animate-fade-in space-y-4 rounded-lg border border-line bg-ink p-3">
          <StageStrip stages={trace.stages} totalMs={trace.total_ms} />

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line pt-3 sm:grid-cols-4">
            <Metric label="Dense candidates" value={String(dense.candidates ?? 0)} tone="dense" />
            <Metric label="BM25 candidates" value={String(sparse.candidates ?? 0)} tone="sparse" />
            <Metric label="Unique after fusion" value={String(fusion.unique_candidates ?? 0)} tone="both" />
            <Metric label="Reranked" value={rerank.applied ? `${rerank.scored} → ${rerank.selected}` : "skipped"} />
          </dl>

          {confidence && <ConfidenceMeter confidence={confidence} />}

          {candidates && candidates.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-2xs font-medium uppercase tracking-wider text-faint">
                Context sent to the model
              </p>
              <ul className="overflow-hidden rounded-lg border border-line">
                {candidates.map((candidate, index) => (
                  <CandidateRow
                    key={candidate.chunk_id}
                    candidate={candidate}
                    rank={index + 1}
                    primaryScore={rerank.applied ? "rerank" : "fusion"}
                    onOpen={onOpenCandidate}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Confidence is a blend of four signals, so the meter shows the blend and
 *  names the signals rather than presenting one opaque percentage. */
export function ConfidenceMeter({ confidence, className }: { confidence: Confidence; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, confidence.score)) * 100);

  return (
    <div className={cx("border-t border-line pt-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-faint">
          <Icon name="target" size={12} />
          Confidence
        </span>
        <span className={cx("font-mono text-2xs tnum", confidence.should_answer ? "text-ok" : "text-warn")}>
          {percent(confidence.score)}
        </span>
      </div>
      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Answer confidence"
      >
        <div
          className={cx("h-full transition-[width] duration-500 ease-edge", confidence.should_answer ? "bg-ok" : "bg-warn")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-2xs leading-relaxed text-muted">{confidence.reason}</p>
      {Object.keys(confidence.signals).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(confidence.signals).map(([key, value]) => (
            <Badge key={key}>
              {key.replace(/_/g, " ")} {value.toFixed(2)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "dense" | "sparse" | "both" }) {
  const dot = { dense: "bg-dense", sparse: "bg-sparse", both: "bg-both" };
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-2xs text-muted">
        {tone && <span className={cx("h-1.5 w-1.5 rounded-full", dot[tone])} />}
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-[13px] text-fg tnum">{value}</dd>
    </div>
  );
}
