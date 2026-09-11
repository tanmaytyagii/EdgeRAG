import { useState } from "react";
import { ms, stageLabels } from "../../lib/format";
import type { Stage } from "../../lib/types";
import { Badge, EmptyState, Icon, Panel, cx, type IconName } from "../ui";
import { PipelineFlow, type FlowNode } from "./PipelineFlow";

/** The stages in the order the query moves through them, with the two
 *  retrievers adjacent because they run at the same time. This is the same
 *  sequence the drawn graph uses — the phone layout below renders it as a
 *  vertical inspection list rather than a shrunken diagram. */
const FLOW: { id: string; label: string; icon: IconName; tone?: FlowNode["tone"] }[] = [
  { id: "query_processing", label: "Query", icon: "search" },
  { id: "dense_retrieval", label: "Dense", icon: "spark", tone: "dense" },
  { id: "sparse_retrieval", label: "BM25", icon: "terminal", tone: "sparse" },
  { id: "hybrid_fusion", label: "Reciprocal rank fusion", icon: "layers", tone: "both" },
  { id: "reranking", label: "Cross-encoder reranker", icon: "target" },
  { id: "context", label: "Top context", icon: "quote" },
  { id: "generation", label: "Local model", icon: "cpu" },
  { id: "answer", label: "Grounded answer", icon: "check", tone: "accent" },
];

const TONE_TEXT: Record<string, string> = {
  dense: "text-dense",
  sparse: "text-sparse",
  both: "text-both",
  accent: "text-accent",
};

const TONE_BORDER: Record<string, string> = {
  dense: "border-dense/35",
  sparse: "border-sparse/35",
  both: "border-both/35",
  accent: "border-accent/35",
};

/** Interactive pipeline.
 *
 *  Every node's values come from the trace the backend produced for the last
 *  query. A stage that did not run — a skipped reranker, or generation on a
 *  retrieval-only trace — is drawn dimmed with no numbers rather than filled
 *  in with plausible ones.
 */
export function PipelineDiagram({
  stages,
  totalMs,
  contextCount,
}: {
  stages: Stage[];
  totalMs: number;
  /** Chunks that would be sent to the model, when the caller knows. */
  contextCount?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const byName = Object.fromEntries(stages.map((stage) => [stage.name, stage]));

  if (stages.length === 0) {
    return (
      <EmptyState
        icon="pipeline"
        title="No trace yet"
        body="Run a query to see how it moved through retrieval, fusion, reranking and generation."
      />
    );
  }

  const contextDetail =
    contextCount === undefined ? undefined : `${contextCount} chunk${contextCount === 1 ? "" : "s"} to the model`;

  const node = (name: string, base: Omit<FlowNode, "id">): FlowNode | undefined => {
    const stage = byName[name];
    if (!stage) return undefined;
    return {
      id: name,
      ...base,
      label: stageLabels[name] ?? base.label,
      timing: ms(stage.duration_ms),
      detail: summarise(name, stage.metrics),
    };
  };

  const nodes: Record<string, FlowNode | undefined> = {
    query_processing: node("query_processing", { label: "Query", icon: "search" }),
    dense_retrieval: node("dense_retrieval", { label: "Dense", icon: "spark", tone: "dense" }),
    sparse_retrieval: node("sparse_retrieval", { label: "BM25", icon: "terminal", tone: "sparse" }),
    hybrid_fusion: node("hybrid_fusion", { label: "Fusion", icon: "layers", tone: "both" }),
    reranking: node("reranking", { label: "Reranker", icon: "target" }),
    generation: node("generation", { label: "Local model", icon: "cpu" }),
    context:
      contextDetail === undefined
        ? undefined
        : { id: "context", label: "Top context", icon: "quote", detail: contextDetail },
  };

  const selected = active ? byName[active] : null;
  const toggle = (id: string) => setActive((current) => (current === id ? null : id));

  return (
    <>
      {/* ------------------------------------------------------- phone flow
          A node graph with two parallel lanes needs width to be legible; at
          390px it becomes a column of unreadable boxes. The same trace is
          better served by a vertical list you can walk down and open, so the
          phone gets a real inspection flow instead of a scaled diagram. */}
      <div className="md:hidden">
        <div className="flex items-center justify-between rounded-lg border border-line bg-raised/40 px-3 py-2.5">
          <span className="text-2xs text-muted">Total retrieval time</span>
          <span className="font-mono text-[15px] text-fg tnum">{ms(totalMs)}</span>
        </div>

        <ol className="mt-3">
          {FLOW.map((step, index) => {
            const stage = byName[step.id];
            const label = stageLabels[step.id] ?? step.label;
            const detail = stage
              ? summarise(step.id, stage.metrics)
              : step.id === "context"
                ? contextDetail
                : undefined;
            // Measured means this trace has values for it. Everything else is
            // shown dimmed and says so, exactly as the diagram dims a node.
            const measured = Boolean(stage) || detail !== undefined;
            const open = active === step.id;
            const share = stage && totalMs > 0 ? Math.min(100, (stage.duration_ms / totalMs) * 100) : null;
            const panelId = `pipeline-stage-${step.id}`;

            const head = (
              <>
                <Icon
                  name={step.icon}
                  size={15}
                  className={cx("shrink-0", step.tone ? TONE_TEXT[step.tone] : "text-faint")}
                />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[13px] font-medium leading-snug text-fg">{label}</span>
                  <span className="mt-0.5 block font-mono text-2xs leading-snug text-faint tnum">
                    {detail ?? "no data in this trace"}
                  </span>
                </span>
                {stage && (
                  <span className="shrink-0 font-mono text-2xs text-muted tnum">{ms(stage.duration_ms)}</span>
                )}
              </>
            );

            const card = cx(
              "rounded-lg border bg-surface",
              step.tone && measured ? TONE_BORDER[step.tone] : "border-line",
              measured ? "surface-1" : "opacity-60",
              open && "raised-surface border-accent",
            );

            return (
              <li key={step.id} className="flex gap-2.5">
                {/* The spine, which is what makes this read as one flow rather
                    than a stack of unrelated cards. */}
                <span aria-hidden="true" className="flex w-3 shrink-0 flex-col items-center pt-4">
                  <span
                    className={cx(
                      "h-2 w-2 shrink-0 rounded-full border",
                      measured
                        ? step.tone
                          ? cx(TONE_BORDER[step.tone], "bg-current", TONE_TEXT[step.tone])
                          : "border-line-strong bg-line-strong"
                        : "border-line bg-surface",
                    )}
                  />
                  {index < FLOW.length - 1 && <span className="mt-1 w-px flex-1 bg-line-strong" />}
                </span>

                <div className="min-w-0 flex-1 pb-2.5">
                  {step.id === "dense_retrieval" && (
                    <p className="pb-1.5 text-2xs text-faint">Dense and BM25 run in parallel</p>
                  )}

                  <div className={card}>
                    {stage ? (
                      <button
                        type="button"
                        onClick={() => toggle(step.id)}
                        aria-expanded={open}
                        aria-controls={panelId}
                        className="press flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                      >
                        {head}
                        <Icon
                          name="chevronDown"
                          size={14}
                          className={cx(
                            "shrink-0 text-faint transition-transform duration-150 ease-edge",
                            open && "rotate-180",
                          )}
                        />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2.5 px-3 py-2.5">{head}</div>
                    )}

                    {/* Share of total elapsed time — measured values only. */}
                    {share !== null && (
                      <div className="px-3 pb-2.5" aria-hidden="true">
                        <span className="block h-0.5 w-full rounded-full bg-line">
                          <span
                            className="block h-full rounded-full bg-accent/70"
                            style={{ width: `${share}%` }}
                          />
                        </span>
                      </div>
                    )}

                    {stage && open && (
                      <div
                        id={panelId}
                        role="region"
                        aria-label={`${label} metrics`}
                        className="border-t border-line px-3 py-2.5 motion-safe:animate-fade-in"
                      >
                        <StageMetrics stage={stage} wrap />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-1 border-t border-line pt-3">
          <p className="flex items-start gap-2 text-2xs leading-relaxed text-muted">
            <Icon name="info" size={13} className="mt-px shrink-0 text-faint" />
            Open a stage to see the metrics it actually measured.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Badge tone="dense">dense · semantic</Badge>
            <Badge tone="sparse">bm25 · lexical</Badge>
            <Badge tone="both">found by both</Badge>
          </div>
          <p className="mt-2.5 text-2xs leading-relaxed text-faint">
            A dimmed stage did not run for this trace.
          </p>
        </div>
      </div>

      {/* --------------------------------------------- tablet and desktop
          Desktop keeps the graph in the wide column with a fixed detail rail.
          Tablets are too narrow for that split but far too wide to stack a
          24rem diagram above a full-width panel, so they get the diagram at
          its natural size beside the detail panel. */}
      <div className="hidden gap-6 md:grid md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <PipelineFlow
          nodes={nodes}
          activeId={active}
          onSelect={toggle}
          footer={
            <div className="flex items-center justify-between font-mono text-2xs text-muted tnum">
              <span>total</span>
              <span className="text-fg">{ms(totalMs)}</span>
            </div>
          }
        />

        <aside className="min-w-0">
          {selected && active ? (
            <Panel title={stageLabels[active] ?? active} bodyClassName="p-3">
              <p className="font-mono text-2xs text-muted tnum">{ms(selected.duration_ms)}</p>
              <div className="mt-3">
                <StageMetrics stage={selected} />
              </div>
            </Panel>
          ) : (
            <Panel bodyClassName="p-3">
              <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
                <Icon name="info" size={14} className="mt-0.5 shrink-0 text-faint" />
                Select a stage to see the metrics it actually measured.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="dense">dense · semantic</Badge>
                <Badge tone="sparse">bm25 · lexical</Badge>
                <Badge tone="both">found by both</Badge>
              </div>
              <p className={cx("mt-3 border-t border-line pt-2.5 text-2xs leading-relaxed text-faint")}>
                A dimmed node means that stage did not run for this trace.
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}

/** The metrics a stage reported, exactly as it reported them. */
function StageMetrics({ stage, wrap = false }: { stage: Stage; wrap?: boolean }) {
  const entries = Object.entries(stage.metrics);
  if (entries.length === 0) {
    return <p className="text-2xs leading-relaxed text-muted">This stage reported no metrics beyond its duration.</p>;
  }
  return (
    <dl className="space-y-1.5">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 last:border-b-0"
        >
          <dt className="text-2xs text-muted">{key.replace(/_/g, " ")}</dt>
          <dd className={cx("font-mono text-2xs text-fg tnum", wrap ? "break-all text-right" : "truncate")}>
            {String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** One line of the most useful metrics per stage, or nothing when the stage
 *  did not report any. */
function summarise(name: string, metrics: Record<string, unknown>): string | undefined {
  if (!metrics) return undefined;
  if (name === "dense_retrieval" || name === "sparse_retrieval") return `${metrics.candidates ?? 0} candidates`;
  if (name === "hybrid_fusion")
    return `${metrics.unique_candidates ?? 0} unique · ${metrics.found_by_both ?? 0} found by both`;
  if (name === "reranking") return metrics.applied ? `${metrics.scored} scored → ${metrics.selected} kept` : "skipped";
  if (name === "generation") return metrics.model ? String(metrics.model) : undefined;
  if (name === "query_processing") return `${metrics.terms ?? 0} terms`;
  return undefined;
}
