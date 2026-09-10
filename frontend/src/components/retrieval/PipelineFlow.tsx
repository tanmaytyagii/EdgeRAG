/** The retrieval pipeline, drawn.
 *
 *  One shape is used in two places: the landing page renders it with labels
 *  only (an accurate picture of the architecture), and the pipeline page
 *  renders the same graph carrying measured values from a real trace. Nothing
 *  here invents a number — a node with no measurement shows none.
 */
import type React from "react";
import { Icon, cx, type IconName, type Tone } from "../ui";

export interface FlowNode {
  id: string;
  label: string;
  /** Measured detail for this node. Omitted when nothing was measured. */
  detail?: string;
  /** Timing, shown on the right of the node. */
  timing?: string;
  icon?: IconName;
  tone?: Extract<Tone, "dense" | "sparse" | "both" | "accent">;
}

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

function Node({
  node,
  active,
  onSelect,
  dimmed,
}: {
  node: FlowNode;
  active?: boolean;
  onSelect?: (id: string) => void;
  dimmed?: boolean;
}) {
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {node.icon && (
          <Icon name={node.icon} size={14} className={node.tone ? TONE_TEXT[node.tone] : "text-faint"} />
        )}
        <span className="truncate text-[13px] font-medium text-fg">{node.label}</span>
      </span>
      {node.timing && <span className="shrink-0 font-mono text-2xs text-muted tnum">{node.timing}</span>}
      {node.detail && (
        <span className="col-span-full block truncate font-mono text-2xs text-faint tnum">{node.detail}</span>
      )}
    </>
  );

  const className = cx(
    "flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-lg border bg-surface px-3 py-2",
    node.tone ? TONE_BORDER[node.tone] : "border-line",
    // A stage with no measurement stays dim: that is what says "this did not
    // run", and it must survive every visual flourish added around it.
    dimmed ? "opacity-45" : "surface-1",
    active && "raised-surface border-accent bg-raised",
    onSelect && "lift text-left hover:border-line-strong hover:bg-raised",
    !onSelect && "transition-colors duration-150 ease-edge",
  );

  if (!onSelect) {
    return <div className={className}>{inner}</div>;
  }
  return (
    <button type="button" onClick={() => onSelect(node.id)} aria-pressed={active} className={className}>
      {inner}
    </button>
  );
}

/** A straight connector between two stacked nodes.
 *
 *  When both ends were measured, a pulse travels down it. The pulse is
 *  decoration on top of a line that already carries the meaning, so reduced
 *  motion simply leaves the line. */
function Link({ arrow, flowing }: { arrow?: boolean; flowing?: boolean }) {
  return (
    <div className="relative h-6" aria-hidden="true">
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-line-strong" />
      {flowing && (
        <span
          className="absolute left-1/2 top-0 h-1 w-1 rounded-full bg-accent motion-safe:animate-[flow-down_2.4s_linear_infinite] motion-reduce:hidden"
          style={{ ["--flow-distance" as string]: "22px" }}
        />
      )}
      {arrow && (
        <Icon
          name="chevronDown"
          size={11}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-px bg-ink text-faint"
        />
      )}
    </div>
  );
}

/** Splits one lane into two: the query fans out to both retrievers. */
function Split() {
  return (
    <div className="relative h-7" aria-hidden="true">
      <span className="absolute left-1/2 top-0 h-3.5 w-px -translate-x-1/2 bg-line-strong" />
      <span className="absolute left-1/4 right-1/4 top-3.5 h-px bg-line-strong" />
      <span className="absolute left-1/4 top-3.5 h-3.5 w-px bg-line-strong" />
      <span className="absolute right-1/4 top-3.5 h-3.5 w-px bg-line-strong" />
    </div>
  );
}

/** Merges two lanes back into one: fusion. */
function Merge() {
  return (
    <div className="relative h-7" aria-hidden="true">
      <span className="absolute left-1/4 top-0 h-3.5 w-px bg-line-strong" />
      <span className="absolute right-1/4 top-0 h-3.5 w-px bg-line-strong" />
      <span className="absolute left-1/4 right-1/4 top-3.5 h-px bg-line-strong" />
      <span className="absolute left-1/2 top-3.5 h-3.5 w-px -translate-x-1/2 bg-line-strong" />
    </div>
  );
}

/**
 *  query → (dense ‖ sparse) → fusion → rerank → context → generation → answer
 *
 *  `nodes` is keyed by id; any id that is absent renders as an unmeasured node,
 *  which is how a skipped reranker or a retrieval-only run appears.
 */
export function PipelineFlow({
  nodes,
  activeId,
  onSelect,
  footer,
  className,
  dimUnmeasured = true,
}: {
  nodes: Record<string, FlowNode | undefined>;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  footer?: React.ReactNode;
  className?: string;
  /** Dim nodes with no measurement. True when showing a trace (a dimmed node
   *  means that stage did not run); false when drawing the architecture
   *  itself, where no stage has run yet and dimming everything says nothing. */
  dimUnmeasured?: boolean;
}) {
  const render = (id: string, fallback: FlowNode) => {
    const node = nodes[id] ?? fallback;
    return (
      <Node
        node={node}
        active={activeId === id}
        onSelect={onSelect}
        dimmed={dimUnmeasured && !nodes[id]}
      />
    );
  };

  // An edge only carries flow when the stages it joins were both measured, so
  // the animation never implies work that did not happen.
  const flows = (from: string, to: string) =>
    !dimUnmeasured ? true : Boolean(nodes[from] && nodes[to]);

  return (
    <div className={cx("mx-auto w-full max-w-sm", className)}>
      {render("query_processing", { id: "query_processing", label: "Query", icon: "search" })}
      <Split />
      <div className="grid grid-cols-2 gap-3">
        {render("dense_retrieval", { id: "dense_retrieval", label: "Dense", icon: "spark", tone: "dense" })}
        {render("sparse_retrieval", { id: "sparse_retrieval", label: "BM25", icon: "terminal", tone: "sparse" })}
      </div>
      <Merge />
      {render("hybrid_fusion", { id: "hybrid_fusion", label: "Reciprocal rank fusion", icon: "layers", tone: "both" })}
      <Link flowing={flows("hybrid_fusion", "reranking")} />
      {render("reranking", { id: "reranking", label: "Cross-encoder reranker", icon: "target" })}
      <Link flowing={flows("reranking", "context")} />
      {render("context", { id: "context", label: "Top context", icon: "quote" })}
      <Link flowing={flows("context", "generation")} />
      {render("generation", { id: "generation", label: "Local model", icon: "cpu" })}
      <Link arrow flowing={flows("generation", "answer")} />
      {render("answer", { id: "answer", label: "Grounded answer", icon: "check", tone: "accent" })}
      {footer && <div className="mt-4 border-t border-line pt-3">{footer}</div>}
    </div>
  );
}
