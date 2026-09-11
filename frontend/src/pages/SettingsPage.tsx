import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { toApiError } from "../lib/errors";
import { bytes } from "../lib/format";
import { GITHUB_ISSUES_URL, GITHUB_OWNER, GITHUB_PROFILE_URL, GITHUB_REPO_URL, LICENSE, PRODUCT_NAME, TAGLINE } from "../lib/identity";
import type { AppSettings, Overview } from "../lib/types";
import { PageBody, PageHeader } from "../components/layout/PageHeader";
import { Mark, Wordmark } from "../components/layout/Logo";
import {
  Badge,
  Button,
  ErrorState,
  Field,
  Icon,
  Input,
  Select,
  Skeleton,
  StatusDot,
  ToggleRow,
  cx,
  useToast,
  type DotState,
  type IconName,
} from "../components/ui";

type Section =
  | "general"
  | "models"
  | "retrieval"
  | "chunking"
  | "confidence"
  | "storage"
  | "system"
  | "privacy"
  | "about";

const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: "general", label: "General", icon: "sliders" },
  { id: "models", label: "Models", icon: "cpu" },
  { id: "retrieval", label: "Retrieval", icon: "explorer" },
  { id: "chunking", label: "Chunking", icon: "layers" },
  { id: "confidence", label: "Confidence", icon: "target" },
  { id: "storage", label: "Storage", icon: "drive" },
  { id: "system", label: "System", icon: "database" },
  { id: "privacy", label: "Privacy", icon: "shield" },
  { id: "about", label: "About", icon: "info" },
];

export function SettingsPage() {
  const { settings, refreshSettings, refreshHealth, health, theme, toggleTheme } = useApp();
  const toast = useToast();
  const [section, setSection] = useState<Section>("general");
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => setDraft(settings), [settings]);

  /** True when the draft differs from what the server last confirmed.
   *  Drives the Save button's state and the warning below it — without this a
   *  user can edit a field, switch section, and lose the change silently. */
  const isDirty = (section: keyof AppSettings): boolean => {
    if (!draft || !settings) return false;
    return JSON.stringify(draft[section]) !== JSON.stringify(settings[section]);
  };

  useEffect(() => {
    void api
      .models()
      .then((body) => setInstalledModels(body.llm.installed))
      .catch(() => setInstalledModels([]));
    void api
      .health()
      .then((body) => setVersion(body.version))
      .catch(() => setVersion(null));
    void api
      .overview()
      .then(setOverview)
      .catch(() => setOverview(null));
  }, []);

  if (!draft) {
    return (
      <PageBody className="space-y-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-16" />
        ))}
      </PageBody>
    );
  }

  const patch = <K extends keyof AppSettings>(key: K, value: Partial<AppSettings[K]>) =>
    setDraft((current) => (current ? { ...current, [key]: { ...(current[key] as object), ...value } } : current));

  const save = async (payload: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const response = await api.patchSettings(payload);
      await refreshSettings();
      await refreshHealth();
      toast.push({
        tone: "success",
        title: "Settings saved",
        body: response.reindex_required
          ? "Existing documents keep their current index. Re-index them to apply the new chunking or embedding settings."
          : undefined,
      });
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setSaving(false);
    }
  };

  const number = (value: number, onChange: (value: number) => void, min = 1) => (
    <Input type="number" min={min} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  );

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Changes apply immediately to new queries. Existing indexes are never rewritten without asking."
      />

      <PageBody className="flex flex-col gap-5 lg:flex-row">
        <nav
          className="flex shrink-0 gap-1 overflow-x-auto lg:sticky lg:top-24 lg:w-48 lg:flex-col lg:self-start lg:overflow-visible"
          aria-label="Settings sections"
        >
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              aria-current={section === item.id ? "page" : undefined}
              className={cx(
                "flex shrink-0 items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px]",
                "transition-[background-color,color,box-shadow] duration-150 ease-edge",
                section === item.id
                  ? "surface-1 bg-raised font-medium text-fg"
                  : "text-muted hover:bg-raised/70 hover:text-fg",
              )}
            >
              <Icon
                name={item.icon}
                size={14}
                className={section === item.id ? "text-accent" : "text-faint"}
              />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 max-w-2xl flex-1 space-y-5">
          {error && <ErrorState error={error} />}

          {section === "general" && (
            <Card
              title="Appearance"
              body="EdgeRAG follows your operating system until you choose a theme here. The choice is stored in this browser only."
            >
              <Field label="Theme" htmlFor="theme-select" hint="Both themes are designed for long reading sessions.">
                <Select
                  id="theme-select"
                  className="max-w-[12rem]"
                  value={theme}
                  onChange={(event) => {
                    if (event.target.value !== theme) toggleTheme();
                  }}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </Select>
              </Field>
            </Card>
          )}

          {section === "retrieval" && (
            <Card
              title="Candidate budgets"
              body="Each stage narrows the funnel. Wider early stages improve recall; a smaller context improves precision and speed."
              onSave={() => void save({ retrieval: draft.retrieval })}
              saving={saving}
              dirty={isDirty("retrieval")}
            >
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Dense top-K" hint="Semantic candidates from the vector index.">
                  {number(draft.retrieval.dense_top_k, (v) => patch("retrieval", { dense_top_k: v }))}
                </Field>
                <Field
                  label="BM25 top-K"
                  hint="Keyword candidates. Keep it close to dense top-K so neither arm dominates."
                >
                  {number(draft.retrieval.sparse_top_k, (v) => patch("retrieval", { sparse_top_k: v }))}
                </Field>
                <Field
                  label="Rerank top-K"
                  hint="How many fused candidates the cross-encoder scores. The main cost knob."
                >
                  {number(draft.retrieval.rerank_top_k, (v) => patch("retrieval", { rerank_top_k: v }))}
                </Field>
                <Field label="Context K" hint="Chunks that reach the model.">
                  {number(draft.retrieval.context_top_k, (v) => patch("retrieval", { context_top_k: v }))}
                </Field>
                <Field label="RRF k" hint="Fusion smoothing. Higher values reduce the pull of the very top ranks.">
                  {number(draft.retrieval.rrf_k, (v) => patch("retrieval", { rrf_k: v }))}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Dense weight">
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      value={draft.retrieval.dense_weight}
                      onChange={(event) => patch("retrieval", { dense_weight: Number(event.target.value) })}
                    />
                  </Field>
                  <Field label="BM25 weight">
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      value={draft.retrieval.sparse_weight}
                      onChange={(event) => patch("retrieval", { sparse_weight: Number(event.target.value) })}
                    />
                  </Field>
                </div>
              </div>
            </Card>
          )}

          {section === "chunking" && (
            <Card
              title="Chunking"
              body="Applies to documents indexed from now on. Re-index existing documents from the Documents page to adopt these values."
              onSave={() => void save({ chunking: draft.chunking })}
              saving={saving}
              dirty={isDirty("chunking")}
            >
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Chunk size" hint="Characters per chunk.">
                  {number(draft.chunking.chunk_size, (v) => patch("chunking", { chunk_size: v }), 128)}
                </Field>
                <Field label="Overlap" hint="Prevents a fact from being cut in half at a boundary.">
                  {number(draft.chunking.chunk_overlap, (v) => patch("chunking", { chunk_overlap: v }), 0)}
                </Field>
                <Field label="Minimum chunk" hint="Fragments shorter than this are dropped as noise.">
                  {number(draft.chunking.min_chunk_chars, (v) => patch("chunking", { min_chunk_chars: v }), 0)}
                </Field>
                <Field label="Splitter" hint="Set before start; shown here for reference.">
                  <Input value={draft.chunking.splitter} readOnly disabled />
                </Field>
              </div>
            </Card>
          )}

          {section === "models" && (
            <>
              <Card
                title="Local language model"
                body="Served by Ollama on this machine."
                onSave={() => void save({ llm: draft.llm })}
                saving={saving}
                dirty={isDirty("llm")}
              >
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <Field
                    label="Model"
                    hint={
                      installedModels.length
                        ? "Models Ollama has pulled."
                        : "Ollama is unreachable, so this list is empty."
                    }
                  >
                    {installedModels.length > 0 ? (
                      <Select
                        value={draft.llm.model}
                        onChange={(event) => patch("llm", { model: event.target.value })}
                      >
                        {!installedModels.includes(draft.llm.model) && (
                          <option value={draft.llm.model}>{draft.llm.model} (not pulled)</option>
                        )}
                        {installedModels.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input value={draft.llm.model} onChange={(event) => patch("llm", { model: event.target.value })} />
                    )}
                  </Field>
                  <Field label="Host">
                    <Input
                      value={draft.llm.base_url}
                      onChange={(event) => patch("llm", { base_url: event.target.value })}
                    />
                  </Field>
                  <Field label="Temperature" hint="Keep it low. Grounded answers should not be creative.">
                    <Input
                      type="number"
                      step="0.05"
                      min={0}
                      max={2}
                      value={draft.llm.temperature}
                      onChange={(event) => patch("llm", { temperature: Number(event.target.value) })}
                    />
                  </Field>
                  <Field label="Max tokens">{number(draft.llm.max_tokens, (v) => patch("llm", { max_tokens: v }), 64)}</Field>
                </div>
                <div className="mt-4">
                  <ToggleRow
                    checked={draft.llm.strip_reasoning_tags}
                    onChange={(value) => patch("llm", { strip_reasoning_tags: value })}
                    title="Hide reasoning blocks"
                    description="Reasoning models emit a chain of thought before the answer. Leave this on."
                  />
                </div>
              </Card>

              <Card
                title="Embeddings and reranking"
                body="Read-only here — set them with environment variables before start, because changing them invalidates existing indexes."
              >
                <dl className="divide-y divide-line rounded-lg border border-line">
                  <Row label="Embedding model" value={draft.embedding.model} />
                  <Row
                    label="Dimensions"
                    value={String(health?.embeddings.dimensions ?? draft.embedding.dimensions)}
                  />
                  <Row label="Vector store" value={draft.vector_store.provider} />
                  <Row
                    label="Reranker"
                    value={draft.reranker.provider === "none" ? "disabled" : draft.reranker.model}
                  />
                </dl>
                {draft.reranker.provider === "none" && (
                  <p className="mt-2.5 flex items-start gap-1.5 text-2xs leading-relaxed text-warn">
                    <Icon name="alert" size={12} className="mt-px" />
                    Reranking is off. Results are ordered by fusion score, and confidence falls back to retriever
                    agreement.
                  </p>
                )}
              </Card>
            </>
          )}

          {section === "confidence" && (
            <Card
              title="Abstention"
              body="When retrieved evidence is weak, EdgeRAG says so rather than generating an answer the sources do not support."
              onSave={() => void save({ confidence: draft.confidence })}
              saving={saving}
              dirty={isDirty("confidence")}
            >
              <div className="mb-4">
                <ToggleRow
                  checked={draft.confidence.enabled}
                  onChange={(value) => patch("confidence", { enabled: value })}
                  title="Abstain when confidence is low"
                  description="Turning this off lets the model answer from weak evidence."
                />
              </div>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field
                  label="Minimum reranker score"
                  hint="The best chunk must beat this. Cross-encoder logits are typically −10 to +10."
                >
                  <Input
                    type="number"
                    step="0.5"
                    value={draft.confidence.min_top_score}
                    onChange={(event) => patch("confidence", { min_top_score: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Supporting chunks" hint="How many chunks must clear that score.">
                  {number(draft.confidence.min_supporting_chunks, (v) =>
                    patch("confidence", { min_supporting_chunks: v }),
                  )}
                </Field>
                <Field
                  label="Minimum confidence"
                  hint="Combined score across strength, margin, support and agreement."
                >
                  <Input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={draft.confidence.min_confidence}
                    onChange={(event) => patch("confidence", { min_confidence: Number(event.target.value) })}
                  />
                </Field>
              </div>
            </Card>
          )}

          {section === "storage" && (
            <Card
              title="Storage"
              body="Where EdgeRAG keeps documents, embeddings and indexes on this machine."
            >
              <dl className="divide-y divide-line rounded-lg border border-line">
                <Row label="Data directory" value={health?.storage.data_dir ?? "unknown"} />
                <Row label="Space used" value={overview ? bytes(overview.storage.bytes) : "—"} />
                <Row label="Documents" value={overview ? String(overview.counts.documents) : "—"} />
                <Row label="Indexed chunks" value={overview ? String(overview.counts.chunks) : "—"} />
                <Row label="Maximum upload" value={bytes(draft.uploads.max_file_bytes)} />
              </dl>
              <div className="mt-3">
                <p className="text-2xs text-muted">Accepted file types</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {draft.uploads.allowed_extensions.map((extension) => (
                    <Badge key={extension}>{extension}</Badge>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {section === "system" && (
            <>
              <Card title="Components" body="Live state of everything EdgeRAG depends on.">
                <dl className="divide-y divide-line rounded-lg border border-line">
                  <HealthRow
                    label="Local model"
                    value={health?.llm.model ?? "unknown"}
                    state={health?.llm.available && health.llm.model_installed ? "ok" : "unavailable"}
                  />
                  <HealthRow
                    label="Embeddings"
                    value={health?.embeddings.model ?? "unknown"}
                    state={health?.embeddings.loaded ? "ok" : "degraded"}
                  />
                  <HealthRow
                    label="Reranker"
                    value={health?.reranker.model ?? "disabled"}
                    state={health?.reranker.model ? "ok" : "degraded"}
                  />
                  <HealthRow
                    label="Vector store"
                    value={String(health?.vector_store.provider ?? "unknown")}
                    state="ok"
                  />
                </dl>
                {health?.llm && !health.llm.available && (
                  <div className="mt-3">
                    <ErrorState
                      error={{
                        code: "llm_unavailable",
                        message: health.llm.error ?? "The local model is unreachable.",
                        remediation: health.llm.remediation ?? "Start Ollama, then refresh.",
                      }}
                      onRetry={() => void refreshHealth()}
                      retryLabel="Check again"
                    />
                  </div>
                )}
              </Card>

              <Card
                title="Developer mode"
                body="Adds stack traces and internal detail to API errors. Leave it off for everyday use."
                onSave={() => void save({ developer_mode: draft.developer_mode })}
                saving={saving}
                dirty={draft.developer_mode !== settings?.developer_mode}
              >
                <ToggleRow
                  checked={draft.developer_mode}
                  onChange={(value) => setDraft({ ...draft, developer_mode: value })}
                  title="Show technical error details"
                  description="Errors in the interface gain an expandable technical section."
                />
                <div className="mt-4">
                  <a
                    href="/api/docs"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"
                  >
                    <Icon name="external" size={13} />
                    Open the API reference
                  </a>
                </div>
              </Card>
            </>
          )}

          {section === "privacy" && (
            <Card title="Privacy" body={draft.privacy.note}>
              <dl className="divide-y divide-line rounded-lg border border-line">
                <Row label="Local-only mode" value={draft.privacy.local_only ? "on" : "off"} />
                <Row label="Telemetry" value={draft.privacy.telemetry_enabled ? "enabled" : "off"} />
                <Row label="Model host" value={draft.llm.base_url} />
                <Row label="Data directory" value={health?.storage.data_dir ?? "unknown"} />
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="both" icon="shield">
                  no cloud APIs
                </Badge>
                <Badge tone="both" icon="shield">
                  no analytics
                </Badge>
                <Badge tone="both" icon="shield">
                  no outbound calls
                </Badge>
              </div>
            </Card>
          )}

          {section === "about" && (
            <Card title="About">
              <div className="flex items-start gap-3">
                <Mark size={36} />
                <div className="min-w-0">
                  <Wordmark className="text-[17px] text-fg" />
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{TAGLINE}</p>
                </div>
              </div>

              <dl className="mt-4 divide-y divide-line rounded-lg border border-line">
                <Row label="Product" value={PRODUCT_NAME} />
                <Row label="Version" value={version ?? "unknown"} />
                <Row label="Licence" value={LICENSE} />
              </dl>

              <div className="mt-4 space-y-2">
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-fg"
                >
                  <Icon name="github" size={15} />
                  <span className="font-medium text-fg">GitHub</span>
                  <span className="truncate font-mono text-2xs text-faint">{GITHUB_REPO_URL}</span>
                </a>
                <a
                  href={GITHUB_PROFILE_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-fg"
                >
                  <Icon name="external" size={15} />
                  <span className="font-medium text-fg">{GITHUB_OWNER}</span>
                  <span className="truncate font-mono text-2xs text-faint">{GITHUB_PROFILE_URL}</span>
                </a>
                <a
                  href={GITHUB_ISSUES_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-fg"
                >
                  <Icon name="alert" size={15} />
                  <span className="font-medium text-fg">Report an issue</span>
                </a>
              </div>
            </Card>
          )}
        </div>
      </PageBody>
    </div>
  );
}

function Card({
  title,
  body,
  children,
  onSave,
  saving,
  dirty,
}: {
  title: string;
  body?: string;
  children?: React.ReactNode;
  onSave?: () => void;
  saving?: boolean;
  /** Whether this section holds edits the server has not confirmed. */
  dirty?: boolean;
}) {
  return (
    <section className="panel surface-1 p-4">
      <h2 className="text-card-title font-semibold text-fg">{title}</h2>
      {body && <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-muted">{body}</p>}
      {children && <div className="mt-4">{children}</div>}
      {onSave && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-line pt-3">
          {dirty && (
            <p className="mr-auto flex items-center gap-1.5 text-2xs text-warn" role="status">
              <Icon name="alert" size={12} />
              Unsaved changes in this section.
            </p>
          )}
          <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={onSave}>
            {dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-2xs text-muted">{label}</dt>
      <dd className="truncate font-mono text-2xs text-fg" title={value}>
        {value}
      </dd>
    </div>
  );
}

function HealthRow({ label, value, state }: { label: string; value: string; state: DotState }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <StatusDot state={state} label={`${label}: ${state}`} />
      <dt className="shrink-0 text-2xs text-muted">{label}</dt>
      <dd className="ml-auto truncate font-mono text-2xs text-fg" title={value}>
        {value}
      </dd>
    </div>
  );
}
