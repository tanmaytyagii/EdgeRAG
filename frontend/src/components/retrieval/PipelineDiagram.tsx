import { useState } from "react";
import { ms, stageLabels } from "../../lib/format";
import type { Stage } from "../../lib/types";
import { Badge, EmptyState, Icon, Panel, cx } from "../ui";
import { PipelineFlow, type FlowNode } from "./PipelineFlow";

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
      contextCount === undefined
        ? undefined
        : {
            id: "context",
            label: "Top context",
            icon: "quote",
            detail: `${contextCount} chunk${contextCount === 1 ? "" : "s"} to the model`,
          },
  };

  const selected = active ? byName[active] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <PipelineFlow
        nodes={nodes}
        activeId={active}
        onSelect={(id) => setActive((current) => (current === id ? null : id))}
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
            {Object.keys(selected.metrics).length === 0 ? (
              <p className="mt-3 text-2xs leading-relaxed text-muted">
                This stage reported no metrics beyond its duration.
              </p>
            ) : (
              <dl className="mt-3 space-y-1.5">
                {Object.entries(selected.metrics).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 last:border-b-0"
                  >
                    <dt className="text-2xs text-muted">{key.replace(/_/g, " ")}</dt>
                    <dd className="truncate font-mono text-2xs text-fg tnum">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
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
