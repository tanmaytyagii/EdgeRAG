import { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { toApiError } from "../lib/errors";
import { ms } from "../lib/format";
import type { ApiError, Candidate, SearchResponse } from "../lib/types";
import { DocumentViewerDrawer } from "../components/documents/DocumentViewer";
import { PageHeader } from "../components/layout/PageHeader";
import { CandidateRow } from "../components/retrieval/CandidateRow";
import { StageStrip } from "../components/retrieval/StageStrip";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  SkeletonRows,
  TabPanel,
  Tabs,
  cx,
} from "../components/ui";

type Stage = "dense" | "sparse" | "fused" | "reranked";

/** Which score column leads for each stage's list. */
const PRIMARY_SCORE: Record<Stage, "dense" | "sparse" | "fusion" | "rerank"> = {
  dense: "dense",
  sparse: "sparse",
  fused: "fusion",
  reranked: "rerank",
};

const KNOBS = [
  { key: "dense_top_k", label: "Dense top-K", hint: "Candidates from the vector index." },
  { key: "sparse_top_k", label: "BM25 top-K", hint: "Candidates from the keyword index." },
  { key: "rerank_top_k", label: "Rerank top-K", hint: "Fused candidates scored by the cross-encoder." },
  { key: "context_top_k", label: "Context K", hint: "Chunks that reach the model." },
  { key: "rrf_k", label: "RRF k", hint: "Higher values flatten the influence of top ranks." },
] as const;

/** Retrieval explorer: run a query and inspect each stage's output separately.
 *  No generation happens here — this is the retrieval half of the system alone. */
export function ExplorerPage() {
  const { activeKb } = useApp();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [stage, setStage] = useState<Stage>("reranked");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [viewer, setViewer] = useState<Candidate | null>(null);

  const run = async () => {
    if (!activeKb || !query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.search({ knowledge_base_id: activeKb.id, query: query.trim(), overrides });
      setResult(response);
      setStage(response.reranker_applied ? "reranked" : "fused");
    } catch (caught) {
      setError(toApiError(caught));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  if (!activeKb) {
    return (
      <div>
        <h1 className="sr-only">Search explorer</h1>
        <EmptyState
          icon="explorer"
          title="No knowledge base selected"
          body="Pick or create one to explore its retrieval behaviour."
        />
      </div>
    );
  }

  const rows = result ? result[stage] : [];

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          sticky={false}
          title="Search explorer"
          description="Run a query through retrieval only and compare what each stage returned. Nothing is sent to the model."
        />

        <div className="shrink-0 border-b border-line py-3">
          <div className="shell shell-workspace">
            <div className="flex gap-2">
              <label htmlFor="explorer-query" className="sr-only">
                Search query
              </label>
              <Input
                id="explorer-query"
                icon="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void run()}
                placeholder="Try an exact term and a paraphrase of the same idea…"
              />
              <Button variant="primary" onClick={() => void run()} loading={busy} disabled={!query.trim()}>
                Search
              </Button>
            </div>

            <details className="group mt-3">
              <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded text-2xs text-muted transition-colors hover:text-fg">
                <Icon
                  name="chevronRight"
                  size={11}
                  className="transition-transform duration-200 group-open:rotate-90"
                />
                Retrieval parameters
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {KNOBS.map((knob) => (
                  <Field key={knob.key} label={knob.label} hint={knob.hint} htmlFor={knob.key}>
                    <Input
                      id={knob.key}
                      type="number"
                      min={1}
                      value={overrides[knob.key] ?? result?.config?.[knob.key] ?? ""}
                      placeholder="default"
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setOverrides((current) => {
                          const next = { ...current };
                          if (!event.target.value || Number.isNaN(value)) delete next[knob.key];
                          else next[knob.key] = value;
                          return next;
                        });
                      }}
                    />
                  </Field>
                ))}
              </div>
            </details>
          </div>
        </div>

        {error && (
          <div className="shell shell-workspace py-4">
            <ErrorState error={error} onRetry={() => void run()} />
          </div>
        )}

        {busy && !result && (
          <div className="shell shell-workspace py-4">
            <SkeletonRows rows={5} />
          </div>
        )}

        {result && (
          <>
            {/* The funnel: how many candidates survived each stage. Every count
                is the length of a list the backend returned. */}
            <div className="shrink-0 border-b border-line py-3">
              <div className="shell shell-workspace">
                <Funnel result={result} />
                <StageStrip className="mt-3.5" stages={result.trace.stages} totalMs={result.trace.total_ms} />
                {!result.reranker_applied && (
                  <p className="mt-2.5 flex items-start gap-1.5 text-2xs leading-relaxed text-warn">
                    <Icon name="alert" size={12} className="mt-px" />
                    Reranking was skipped, so results are ordered by fusion score. Enable a reranker in Settings
                    for higher precision.
                  </p>
                )}
              </div>
            </div>

            <Tabs
              idPrefix="explorer"
              className="shell shell-workspace"
              value={stage}
              onChange={setStage}
              options={[
                { value: "dense", label: "Dense", count: result.dense.length, tone: "dense" },
                { value: "sparse", label: "BM25", count: result.sparse.length, tone: "sparse" },
                { value: "fused", label: "Fused", count: result.fused.length, tone: "both" },
                { value: "reranked", label: "Reranked", count: result.reranked.length },
              ]}
            />

            <TabPanel idPrefix="explorer" value={stage} className="min-h-0 flex-1 overflow-y-auto">
              {rows.length === 0 ? (
                <EmptyState
                  icon="search"
                  title={`No ${stage} results`}
                  body={
                    stage === "sparse"
                      ? "BM25 found no chunk containing these terms. That is expected for a purely conceptual query — this is exactly the gap dense retrieval fills."
                      : "This stage returned nothing for the current parameters."
                  }
                />
              ) : (
                <ul>
                  {rows.map((candidate, index) => (
                    <CandidateRow
                      key={candidate.chunk_id}
                      candidate={candidate}
                      rank={index + 1}
                      primaryScore={PRIMARY_SCORE[stage]}
                      selected={result.selected.some((selected) => selected.chunk_id === candidate.chunk_id)}
                      onOpen={setViewer}
                    />
                  ))}
                </ul>
              )}
            </TabPanel>

            <div className="shrink-0 border-t border-line py-2">
              <div className="shell shell-workspace flex flex-wrap items-center gap-3 font-mono text-2xs text-faint tnum">
                <span>{ms(result.trace.total_ms)} total</span>
                <span className="flex items-center gap-1.5">
                  <Badge tone="both">{result.selected.length}</Badge> would reach the model
                </span>
              </div>
            </div>
          </>
        )}

        {!result && !error && !busy && (
          <EmptyState
            icon="explorer"
            title="Compare the retrievers"
            body="Search once, then switch between the Dense and BM25 tabs. Chunks both retrievers found are marked, and those are the ones fusion promotes."
          />
        )}
      </div>

      {viewer && (
        <DocumentViewerDrawer
          open
          documentId={viewer.document_id}
          chunkId={viewer.chunk_id}
          page={viewer.page}
          filename={viewer.document_name}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

/** Stage-by-stage candidate counts, read from the returned lists. */
function Funnel({ result }: { result: SearchResponse }) {
  const steps: { label: string; value: number; tone?: "dense" | "sparse" | "both" | "accent" }[] = [
    { label: "Dense", value: result.dense.length, tone: "dense" },
    { label: "BM25", value: result.sparse.length, tone: "sparse" },
    { label: "Fused", value: result.fused.length, tone: "both" },
    { label: result.reranker_applied ? "Reranked" : "Rerank skipped", value: result.reranked.length },
    { label: "To the model", value: result.selected.length, tone: "accent" },
  ];

  const dot = {
    dense: "bg-dense",
    sparse: "bg-sparse",
    both: "bg-both",
    accent: "bg-accent",
  };

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-1">
          <span className="lift flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 surface-1">
            {step.tone && <span className={cx("h-1.5 w-1.5 rounded-full", dot[step.tone])} />}
            <span className="text-2xs text-muted">{step.label}</span>
            <span className="font-mono text-[13px] text-fg tnum">{step.value}</span>
          </span>
          {index < steps.length - 1 && <Icon name="chevronRight" size={12} className="text-faint" />}
        </li>
      ))}
    </ol>
  );
}
