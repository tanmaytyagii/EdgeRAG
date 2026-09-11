import { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { toApiError } from "../lib/errors";
import type { ApiError, SearchResponse } from "../lib/types";
import { PageBody, PageHeader } from "../components/layout/PageHeader";
import { PipelineDiagram } from "../components/retrieval/PipelineDiagram";
import { Button, EmptyState, ErrorState, Input, Skeleton } from "../components/ui";

/** The pipeline visualization. Nodes are populated from a real trace produced by
 *  running the query — there is no illustrative or demo mode. */
export function PipelinePage() {
  const { activeKb } = useApp();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = async () => {
    if (!activeKb || !query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.search({ knowledge_base_id: activeKb.id, query: query.trim() }));
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
        <h1 className="sr-only">Retrieval pipeline</h1>
        <EmptyState
          icon="pipeline"
          title="No knowledge base selected"
          body="Pick one to trace a query through the pipeline."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Retrieval pipeline"
        description="Trace one query through every retrieval stage, then open a stage to see what it measured. Generation runs in Chat, so it stays dimmed here."
      />

      <div className="border-b border-line py-3">
        <div className="shell shell-workspace flex gap-2">
          <label htmlFor="pipeline-query" className="sr-only">
            Query to trace
          </label>
          <Input
            id="pipeline-query"
            icon="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void run()}
            placeholder="Enter a query to trace…"
          />
          <Button variant="primary" onClick={() => void run()} loading={busy} disabled={!query.trim()}>
            Trace
          </Button>
        </div>
      </div>

      <PageBody>
        {error ? (
          <ErrorState error={error} onRetry={() => void run()} />
        ) : busy && !result ? (
          <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Skeleton className="mx-auto h-[30rem] w-full max-w-sm" />
            <Skeleton className="hidden h-40 md:block" />
          </div>
        ) : (
          <PipelineDiagram
            stages={result?.trace.stages ?? []}
            totalMs={result?.trace.total_ms ?? 0}
            contextCount={result?.selected.length}
          />
        )}
      </PageBody>
    </div>
  );
}
