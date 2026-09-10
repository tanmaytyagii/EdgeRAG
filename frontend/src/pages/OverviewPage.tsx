import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { bytes, count, relativeTime } from "../lib/format";
import { useAsync, usePolling } from "../lib/hooks";
import type { Overview } from "../lib/types";
import { PageBody, PageHeader } from "../components/layout/PageHeader";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Panel,
  Skeleton,
  StatusDot,
  cx,
  fileIcon,
  type DotState,
  type IconName,
} from "../components/ui";

export function OverviewPage() {
  const navigate = useNavigate();
  const { refreshHealth } = useApp();
  const { data, loading, error, refresh } = useAsync<Overview>(() => api.overview(), []);

  usePolling(refresh, 4000, Boolean(data && data.indexing.in_progress > 0));

  if (loading && !data) return <OverviewSkeleton />;
  if (error) {
    return (
      <PageBody>
        <ErrorState error={error} onRetry={refresh} />
      </PageBody>
    );
  }
  if (!data) return null;

  const { counts, indexing, stack, health, storage } = data;
  const empty = counts.knowledge_bases === 0;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Everything on this page is read from your local index. Nothing is estimated."
        actions={
          <Button
            size="sm"
            icon="refresh"
            onClick={() => {
              void refresh();
              void refreshHealth();
            }}
          >
            Refresh
          </Button>
        }
      />

      {empty ? (
        <EmptyState
          icon="library"
          title="Nothing indexed yet"
          body="Create a knowledge base, drop in a few documents, and EdgeRAG will build the dense and keyword indexes locally."
          action={
            <Button variant="primary" icon="plus" onClick={() => navigate("/app/knowledge-bases")}>
              Create a knowledge base
            </Button>
          }
        />
      ) : (
        <PageBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Knowledge bases"
              value={count(counts.knowledge_bases)}
              icon="library"
              onClick={() => navigate("/app/knowledge-bases")}
            />
            <Stat
              label="Documents"
              value={count(counts.documents)}
              icon="documents"
              onClick={() => navigate("/app/documents")}
            />
            <Stat label="Indexed chunks" value={count(counts.chunks)} icon="layers" />
            <Stat label="Storage used" value={bytes(storage.bytes)} icon="drive" />
          </div>

          {(indexing.in_progress > 0 || indexing.failed > 0) && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px]">
              {indexing.in_progress > 0 && (
                <span className="flex items-center gap-2 text-fg">
                  <StatusDot state="busy" />
                  {indexing.in_progress} document{indexing.in_progress === 1 ? "" : "s"} indexing
                </span>
              )}
              {indexing.failed > 0 && (
                <button
                  onClick={() => navigate("/app/documents")}
                  className="flex items-center gap-2 rounded text-danger hover:underline"
                >
                  <StatusDot state="unavailable" />
                  {indexing.failed} failed — review
                </button>
              )}
              <span className="ml-auto font-mono text-2xs text-faint">
                last indexed {relativeTime(indexing.last_indexed_at)}
              </span>
            </div>
          )}

          {/* Quick actions: the three things there are to do here. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <QuickAction
              icon="chat"
              title="Ask a question"
              body="Query your documents and get an answer with citations."
              onClick={() => navigate("/app/chat")}
            />
            <QuickAction
              icon="upload"
              title="Add documents"
              body="Index PDFs, Markdown, text or Word files."
              onClick={() => navigate("/app/documents")}
            />
            <QuickAction
              icon="explorer"
              title="Inspect retrieval"
              body="Compare what dense and BM25 each returned."
              onClick={() => navigate("/app/explorer")}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <Panel
                title="Recent documents"
                action={
                  <Button size="sm" variant="ghost" iconRight="chevronRight" onClick={() => navigate("/app/documents")}>
                    All documents
                  </Button>
                }
              >
                {data.recent_documents.length === 0 ? (
                  <EmptyState
                    compact
                    icon="documents"
                    title="No documents yet"
                    body="Add a file and it will appear here as soon as it is indexed."
                    action={
                      <Button size="sm" icon="upload" onClick={() => navigate("/app/documents")}>
                        Add documents
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {data.recent_documents.map((document) => (
                      <li key={document.id}>
                        <button
                          onClick={() => navigate("/app/documents")}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-raised"
                        >
                          <Icon name={fileIcon(document.filename)} size={15} className="text-faint" />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{document.filename}</span>
                          <StatusDot
                            state={
                              document.status === "ready"
                                ? "ok"
                                : document.status === "failed"
                                  ? "unavailable"
                                  : "busy"
                            }
                            label={`Status: ${document.status}`}
                          />
                          <span className="shrink-0 font-mono text-2xs text-faint tnum">
                            {count(document.chunk_count)} chunks
                          </span>
                          <span className="hidden shrink-0 font-mono text-2xs text-faint sm:block">
                            {relativeTime(document.created_at)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Activity">
                {data.activity.length === 0 ? (
                  <EmptyState
                    compact
                    icon="clock"
                    title="Nothing has happened yet"
                    body="Indexing a document or asking a question will show up here."
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {data.activity.map((entry) => (
                      <li key={entry.id} className="flex items-baseline gap-3 px-3 py-2">
                        <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-fg/85">{entry.summary}</span>
                        <span className="shrink-0 font-mono text-2xs text-faint">{relativeTime(entry.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="space-y-5">
              <Panel title="System health">
                <dl className="divide-y divide-line">
                  <HealthRow
                    label="Local model"
                    value={stack.llm_model}
                    state={health.llm.available && health.llm.model_installed ? "ok" : "unavailable"}
                  />
                  <HealthRow
                    label="Embeddings"
                    value={stack.embedding_model}
                    state={health.embeddings.loaded ? "ok" : "degraded"}
                  />
                  <HealthRow
                    label="Reranker"
                    value={health.reranker.model ?? "disabled"}
                    state={health.reranker.model ? "ok" : "degraded"}
                  />
                  <HealthRow label="Vector store" value={stack.vector_store} state="ok" />
                  <HealthRow label="Retrieval" value={stack.retrieval} state="ok" />
                </dl>
                {!health.llm.available && (
                  <div className="border-t border-line p-3">
                    <ErrorState
                      error={{
                        code: "llm_unavailable",
                        message: health.llm.error ?? "The local model is unreachable.",
                        remediation: health.llm.remediation ?? undefined,
                      }}
                    />
                  </div>
                )}
              </Panel>

              <Panel
                title="Recent conversations"
                action={
                  <Button size="sm" variant="ghost" iconRight="chevronRight" onClick={() => navigate("/app/chat")}>
                    Open chat
                  </Button>
                }
              >
                {data.recent_conversations.length === 0 ? (
                  <EmptyState
                    compact
                    icon="chat"
                    title="No questions asked yet"
                    body="Ask something answerable from your documents to start."
                    action={
                      <Button size="sm" icon="chat" onClick={() => navigate("/app/chat")}>
                        Ask a question
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {data.recent_conversations.map((conversation) => (
                      <li key={conversation.id}>
                        <button
                          onClick={() => navigate("/app/chat")}
                          className="w-full px-3 py-2 text-left transition-colors hover:bg-raised"
                        >
                          <p className="truncate text-[13px] text-fg">{conversation.title}</p>
                          <p className="font-mono text-2xs text-faint">{relativeTime(conversation.updated_at)}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Privacy">
                <div className="space-y-2.5 p-3">
                  <Badge tone="both" icon="shield">
                    local only
                  </Badge>
                  <p className="text-[13px] leading-relaxed text-muted">
                    Documents, embeddings and indexes stay on this machine. EdgeRAG sends no telemetry and
                    calls no cloud API.
                  </p>
                </div>
              </Panel>
            </div>
          </div>
        </PageBody>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  icon: IconName;
  onClick?: () => void;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      onClick={onClick}
      className={cx(
        "panel surface-1 group px-3.5 py-3 text-left",
        onClick && "lift hover:border-line-strong hover:bg-raised",
      )}
    >
      <p className="flex items-center gap-1.5 text-2xs text-muted">
        <Icon name={icon} size={12} className="text-faint" />
        {label}
      </p>
      <p className="mt-1.5 font-mono text-2xl font-medium text-fg tnum">{value}</p>
    </Component>
  );
}

function QuickAction({
  icon,
  title,
  body,
  onClick,
}: {
  icon: IconName;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="panel surface-1 lift group flex items-start gap-3 p-3 text-left hover:border-line-strong hover:bg-raised"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-raised text-muted transition-colors group-hover:border-accent/40 group-hover:text-accent">
        <Icon name={icon} size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-fg">{title}</span>
        <span className="mt-0.5 block text-2xs leading-relaxed text-muted">{body}</span>
      </span>
      <Icon
        name="arrowRight"
        size={14}
        className="ml-auto shrink-0 self-center text-faint transition-transform duration-150 group-hover:translate-x-0.5"
      />
    </button>
  );
}

function HealthRow({ label, value, state }: { label: string; value: string; state: DotState }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <StatusDot state={state} label={`${label}: ${state}`} />
      <dt className="text-2xs text-muted">{label}</dt>
      <dd className="ml-auto truncate font-mono text-2xs text-fg">{value}</dd>
    </div>
  );
}

/** Shaped like the real page so nothing shifts when the data lands. */
function OverviewSkeleton() {
  return (
    <div aria-busy="true">
      <div className="border-b border-line px-5 py-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-2 h-3 w-80" />
      </div>
      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-[74px]" />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-[68px]" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </PageBody>
    </div>
  );
}
