import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { toApiError } from "../lib/errors";
import { ms, percent, relativeTime } from "../lib/format";
import { usePolling } from "../lib/hooks";
import type { EvalCase, EvalRun } from "../lib/types";
import { PageBody, PageHeader } from "../components/layout/PageHeader";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  IconButton,
  Input,
  Modal,
  Textarea,
  Tooltip,
  cx,
  useToast,
} from "../components/ui";

const METRIC_HELP: Record<string, string> = {
  context_precision: "Share of retrieved chunks that came from a document the case expects.",
  context_recall: "Share of expected documents that appear in the retrieved context.",
  keyword_recall: "Share of expected keywords present in the answer.",
  answer_overlap: "Token F1 between the answer and the reference answer.",
  faithfulness: "Share of the answer's content words that also appear in its own retrieved context.",
};

export function EvaluationsPage() {
  const { activeKb } = useApp();
  const toast = useToast();
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [openRun, setOpenRun] = useState<EvalRun | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [form, setForm] = useState({
    question: "",
    expected_answer: "",
    expected_keywords: "",
    expected_documents: "",
  });

  const load = useCallback(async () => {
    if (!activeKb) return;
    try {
      const [caseRows, runRows] = await Promise.all([api.evalCases(activeKb.id), api.evalRuns(activeKb.id)]);
      setCases(caseRows);
      setRuns(runRows);
      setError(null);
    } catch (caught) {
      setError(toApiError(caught));
    }
  }, [activeKb]);

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(
    () => {
      void load();
    },
    2000,
    runs.some((run) => run.status === "running"),
  );

  useEffect(() => {
    if (!openRun) return;
    const fresh = runs.find((run) => run.id === openRun.id);
    if (fresh && fresh.status !== "running" && openRun.status === "running") {
      void api.evalRun(openRun.id).then(setOpenRun).catch(() => undefined);
    }
  }, [runs, openRun]);

  const addCase = async () => {
    if (!activeKb) return;
    try {
      await api.createEvalCase(activeKb.id, {
        question: form.question,
        expected_answer: form.expected_answer,
        expected_keywords: form.expected_keywords.split(",").map((value) => value.trim()).filter(Boolean),
        expected_documents: form.expected_documents.split(",").map((value) => value.trim()).filter(Boolean),
      });
      setForm({ question: "", expected_answer: "", expected_keywords: "", expected_documents: "" });
      setAdding(false);
      void load();
    } catch (caught) {
      toast.push({ tone: "error", title: "The case was not saved", body: toApiError(caught).message });
    }
  };

  const removeCase = async (id: string) => {
    try {
      await api.deleteEvalCase(id);
      void load();
    } catch (caught) {
      toast.push({ tone: "error", title: "The case was not removed", body: toApiError(caught).message });
    }
  };

  const start = async (retrievalOnly: boolean) => {
    if (!activeKb) return;
    try {
      await api.startEvalRun({ knowledge_base_id: activeKb.id, retrieval_only: retrievalOnly });
      toast.push({
        tone: "info",
        title: retrievalOnly ? "Scoring retrieval" : "Running the full pipeline",
        body: retrievalOnly ? undefined : "Generation on CPU takes about 20 seconds per case.",
      });
      void load();
    } catch (caught) {
      toast.push({ tone: "error", title: "The run did not start", body: toApiError(caught).message });
    }
  };

  if (!activeKb) {
    return (
      <div>
        <h1 className="sr-only">Evaluations</h1>
        <EmptyState
          icon="evaluations"
          title="No knowledge base selected"
          body="Pick one to evaluate its retrieval and answers."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Evaluations"
        description="Score this knowledge base against questions whose answers you already know. Retrieval-only runs are fast; full runs also grade the generated answer."
        actions={
          <>
            <Button size="sm" icon="plus" onClick={() => setAdding(true)}>
              Add case
            </Button>
            <Button size="sm" icon="explorer" onClick={() => void start(true)} disabled={cases.length === 0}>
              Score retrieval
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon="evaluations"
              onClick={() => void start(false)}
              disabled={cases.length === 0}
            >
              Run full
            </Button>
          </>
        }
      />

      <PageBody className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg">
            Cases
            <span className="font-mono text-2xs text-faint tnum">{cases.length}</span>
          </h2>

          {error && <ErrorState error={error} onRetry={load} />}

          {cases.length === 0 ? (
            <EmptyState
              icon="evaluations"
              title="No evaluation cases"
              body="Add a question with the answer you expect. EdgeRAG will check whether retrieval surfaces the right passages and whether the answer stays grounded in them."
              action={
                <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                  Add the first case
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {cases.map((item) => (
                <li key={item.id} className="bg-surface px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-fg">{item.question}</p>
                    <IconButton
                      icon="trash"
                      label={`Remove case: ${item.question}`}
                      size="sm"
                      className="-mr-1 -mt-1 hover:text-danger"
                      onClick={() => void removeCase(item.id)}
                    />
                  </div>
                  {item.expected_answer && (
                    <p className="mt-1 text-2xs leading-relaxed text-muted">
                      <span className="text-faint">Expected:</span> {item.expected_answer}
                    </p>
                  )}
                  {(item.expected_keywords.length > 0 || item.expected_documents.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.expected_keywords.map((keyword) => (
                        <Badge key={keyword}>{keyword}</Badge>
                      ))}
                      {item.expected_documents.map((doc) => (
                        <Badge key={doc} tone="dense" icon="file">
                          {doc}
                        </Badge>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg">
            Runs
            <span className="font-mono text-2xs text-faint tnum">{runs.length}</span>
          </h2>

          {runs.length === 0 ? (
            <EmptyState
              icon="clock"
              title="No runs yet"
              body={
                cases.length === 0
                  ? "Add at least one case, then score retrieval to see how the pipeline performs."
                  : "Score retrieval for a fast check, or run the full pipeline to grade generated answers too."
              }
              action={
                cases.length > 0 ? (
                  <Button icon="explorer" onClick={() => void start(true)}>
                    Score retrieval
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-2">
              {runs.map((run) => (
                <li key={run.id}>
                  <button
                    onClick={async () => setOpenRun(await api.evalRun(run.id))}
                    className={cx(
                      "lift w-full rounded-xl border border-line bg-surface p-3 text-left surface-1",
                      "hover:border-line-strong hover:bg-raised",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={run.status === "completed" ? "both" : "accent"}>{run.status}</Badge>
                      {run.summary?.retrieval_only && <Badge>retrieval only</Badge>}
                      {run.status === "running" && (
                        <span className="text-2xs text-muted">Polling for results…</span>
                      )}
                      <span className="ml-auto font-mono text-2xs text-faint">{relativeTime(run.created_at)}</span>
                    </div>

                    {run.status === "completed" && run.summary && (
                      <dl className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        <Metric label="cases" value={String(run.summary.cases)} />
                        <Metric label="abstained" value={String(run.summary.abstained)} />
                        <Metric label="latency" value={ms(run.summary.mean_latency_ms)} />
                        {Object.entries(run.summary.metrics).map(([key, value]) => (
                          <Metric
                            key={key}
                            label={key.replace(/_/g, " ")}
                            value={value === null ? "—" : value.toFixed(2)}
                            help={METRIC_HELP[key]}
                          />
                        ))}
                      </dl>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageBody>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="New evaluation case"
        description="Only the question is required. The rest sharpens the scoring."
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" disabled={!form.question.trim()} onClick={() => void addCase()}>
              Add case
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label="Question" htmlFor="eval-question">
            <Textarea
              id="eval-question"
              rows={2}
              value={form.question}
              onChange={(event) => setForm({ ...form, question: event.target.value })}
              placeholder="What does the handbook say about refunds?"
            />
          </Field>
          <Field label="Expected answer" hint="Used for a coarse token-overlap score." htmlFor="eval-answer">
            <Textarea
              id="eval-answer"
              rows={2}
              value={form.expected_answer}
              onChange={(event) => setForm({ ...form, expected_answer: event.target.value })}
            />
          </Field>
          <Field
            label="Expected keywords"
            hint="Comma separated. Each is checked for presence in the answer."
            htmlFor="eval-keywords"
          >
            <Input
              id="eval-keywords"
              value={form.expected_keywords}
              onChange={(event) => setForm({ ...form, expected_keywords: event.target.value })}
              placeholder="performance, cost, time"
            />
          </Field>
          <Field
            label="Expected documents"
            hint="Comma separated filenames. Used for retrieval precision and recall."
            htmlFor="eval-documents"
          >
            <Input
              id="eval-documents"
              value={form.expected_documents}
              onChange={(event) => setForm({ ...form, expected_documents: event.target.value })}
              placeholder="handbook.pdf"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(openRun)}
        onClose={() => setOpenRun(null)}
        title="Run details"
        description={openRun ? `Started ${relativeTime(openRun.created_at)}` : undefined}
        wide
        footer={<Button onClick={() => setOpenRun(null)}>Close</Button>}
      >
        {openRun?.results?.length ? (
          <ul className="space-y-3">
            {openRun.results.map((result) => (
              <li key={result.case_id} className="rounded-lg border border-line p-3">
                <p className="text-[13px] font-medium text-fg">{result.question}</p>
                {result.error ? (
                  <p className="mt-1.5 flex items-start gap-1.5 text-2xs text-danger">
                    <Icon name="alert" size={12} className="mt-px" />
                    {result.error}
                  </p>
                ) : (
                  <>
                    {result.answer && (
                      <p className="mt-1.5 line-clamp-4 text-[13px] leading-relaxed text-muted">{result.answer}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.abstained && <Badge tone="warn">abstained</Badge>}
                      <Badge>{ms(result.latency_ms)}</Badge>
                      <Badge>{result.citation_count} citations</Badge>
                      {result.citation_coverage !== null && (
                        <Badge>coverage {percent(result.citation_coverage)}</Badge>
                      )}
                      {Object.entries(result.metrics).map(([key, value]) =>
                        value === null ? null : (
                          <Badge key={key} tone="dense">
                            {key.replace(/_/g, " ")} {value.toFixed(2)}
                          </Badge>
                        ),
                      )}
                    </div>
                    {result.retrieved?.length > 0 && (
                      <p className="mt-2 break-words font-mono text-2xs text-faint">
                        retrieved: {result.retrieved.map((row) => `${row.document}${row.page ? `:${row.page}` : ""}`).join(", ")}
                      </p>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={openRun?.status === "running" ? "clock" : "evaluations"}
            title={openRun?.status === "running" ? "The run is still going" : "No results recorded"}
            body={
              openRun?.status === "running"
                ? "Results appear here as each case finishes. This dialog updates itself."
                : "This run finished without recording per-case results."
            }
          />
        )}
      </Modal>
    </div>
  );
}

function Metric({ label, value, help }: { label: string; value: string; help?: string }) {
  const content = (
    <div className="min-w-0">
      <dt className={cx("truncate text-2xs text-muted", help && "cursor-help underline decoration-dotted underline-offset-2")}>
        {label}
      </dt>
      <dd className="font-mono text-[13px] text-fg tnum">{value}</dd>
    </div>
  );
  return help ? <Tooltip label={help}>{content}</Tooltip> : content;
}
