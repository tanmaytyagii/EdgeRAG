import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { toApiError } from "../lib/errors";
import { count, relativeTime } from "../lib/format";
import type { ApiError, KnowledgeBase } from "../lib/types";
import { PageBody, PageHeader } from "../components/layout/PageHeader";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  Menu,
  Modal,
  Skeleton,
  Textarea,
  cx,
  useToast,
} from "../components/ui";

export function KnowledgeBasesPage() {
  const { knowledgeBases, activeKb, refreshKnowledgeBases, setActiveKb, loading, error } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<KnowledgeBase | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeBase | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [formError, setFormError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await api.updateKnowledgeBase(editing.id, form);
        toast.push({ tone: "success", title: "Knowledge base updated" });
      } else {
        const created = await api.createKnowledgeBase(form);
        setActiveKb(created.id);
        toast.push({
          tone: "success",
          title: `Created ${created.name}`,
          action: { label: "Add documents", run: () => navigate("/app/documents") },
        });
      }
      await refreshKnowledgeBases();
      setCreating(false);
      setEditing(null);
      setForm({ name: "", description: "" });
    } catch (caught) {
      setFormError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.deleteKnowledgeBase(deleting.id);
      toast.push({ tone: "success", title: `Deleted ${deleting.name}` });
      await refreshKnowledgeBases();
    } catch (caught) {
      toast.push({ tone: "error", title: "Delete failed", body: toApiError(caught).message });
    } finally {
      setDeleting(null);
    }
  };

  const duplicate = async (kb: KnowledgeBase) => {
    try {
      await api.duplicateKnowledgeBase(kb.id);
      toast.push({
        tone: "success",
        title: "Configuration copied",
        body: "Documents are not copied — add or re-index them in the new base.",
      });
      await refreshKnowledgeBases();
    } catch (caught) {
      toast.push({ tone: "error", title: "Duplicate failed", body: toApiError(caught).message });
    }
  };

  const exportKb = async (kb: KnowledgeBase) => {
    try {
      const payload = await api.exportKnowledgeBase(kb.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${kb.name.replace(/\s+/g, "-").toLowerCase()}.edgerag.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      toast.push({ tone: "error", title: "Export failed", body: toApiError(caught).message });
    }
  };

  const openCreate = () => {
    setForm({ name: "", description: "" });
    setFormError(null);
    setCreating(true);
  };

  return (
    <div>
      <PageHeader
        title="Knowledge bases"
        description="Each one has its own vector index, keyword index and retrieval configuration."
        actions={
          <Button variant="primary" size="sm" icon="plus" onClick={openCreate}>
            New knowledge base
          </Button>
        }
      />

      <PageBody>
        {error && <ErrorState error={error} onRetry={refreshKnowledgeBases} />}

        {loading && knowledgeBases.length === 0 && !error && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-44" />
            ))}
          </div>
        )}

        {!loading && knowledgeBases.length === 0 && !error && (
          <EmptyState
            icon="library"
            title="No knowledge bases"
            body="A knowledge base groups documents that should be searched together — one per project, client or topic."
            action={
              <Button variant="primary" icon="plus" onClick={openCreate}>
                Create the first one
              </Button>
            }
          />
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {knowledgeBases.map((kb) => {
            const isActive = kb.id === activeKb?.id;
            return (
              <article
                key={kb.id}
                className={cx(
                  "panel lift lift-md flex flex-col p-3.5",
                  isActive ? "raised-surface border-accent/50 bg-raised" : "surface-1 hover:border-line-strong",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setActiveKb(kb.id);
                          navigate("/app/chat");
                        }}
                        className="press flex min-w-0 items-center rounded text-left"
                      >
                        <h2 className="truncate text-card-title font-semibold text-fg hover:underline">{kb.name}</h2>
                      </button>
                      {isActive && (
                        <Badge tone="accent" icon="check">
                          active
                        </Badge>
                      )}
                    </div>
                    {kb.description ? (
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{kb.description}</p>
                    ) : (
                      <p className="mt-1 text-[13px] italic text-faint">No description</p>
                    )}
                  </div>

                  <Menu
                    label={`Actions for ${kb.name}`}
                    items={[
                      {
                        label: "Rename",
                        icon: "sliders",
                        onSelect: () => {
                          setEditing(kb);
                          setForm({ name: kb.name, description: kb.description });
                          setFormError(null);
                        },
                      },
                      { label: "Duplicate config", icon: "copy", onSelect: () => void duplicate(kb) },
                      { label: "Export", icon: "download", onSelect: () => void exportKb(kb) },
                      { label: "Delete", icon: "trash", danger: true, onSelect: () => setDeleting(kb) },
                    ]}
                  />
                </div>

                <dl className="mt-3.5 grid grid-cols-2 gap-2 border-t border-line pt-3">
                  <div>
                    <dt className="flex items-center gap-1.5 text-2xs text-muted">
                      <Icon name="documents" size={11} className="text-faint" />
                      Documents
                    </dt>
                    <dd className="mt-0.5 font-mono text-[15px] text-fg tnum">{count(kb.document_count)}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-2xs text-muted">
                      <Icon name="layers" size={11} className="text-faint" />
                      Chunks
                    </dt>
                    <dd className="mt-0.5 font-mono text-[15px] text-fg tnum">{count(kb.chunk_count)}</dd>
                  </div>
                </dl>

                <p className="mt-2.5 truncate font-mono text-2xs text-faint" title={kb.embedding_model}>
                  {kb.embedding_model} · indexed {relativeTime(kb.last_indexed_at)}
                </p>

                <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="chat"
                    onClick={() => {
                      setActiveKb(kb.id);
                      navigate("/app/chat");
                    }}
                  >
                    Chat
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="documents"
                    onClick={() => {
                      setActiveKb(kb.id);
                      navigate("/app/documents");
                    }}
                  >
                    Documents
                  </Button>
                  {!isActive && (
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setActiveKb(kb.id)}>
                      Make active
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </PageBody>

      <Modal
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? "Rename knowledge base" : "New knowledge base"}
        description={editing ? undefined : "Give it a name that says what it holds."}
        footer={
          <>
            <Button
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" loading={busy} disabled={!form.name.trim()} onClick={() => void submit()}>
              {editing ? "Save changes" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label="Name" htmlFor="kb-name">
            <Input
              id="kb-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              onKeyDown={(event) => event.key === "Enter" && form.name.trim() && void submit()}
              placeholder="Research papers"
            />
          </Field>
          <Field label="Description" hint="Optional. Helps when you have several." htmlFor="kb-description">
            <Textarea
              id="kb-description"
              rows={3}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="What belongs in here?"
            />
          </Field>
          {formError && <ErrorState error={formError} />}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This removes its documents, embeddings and keyword index from disk. It cannot be undone."
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Keep it</Button>
            <Button variant="danger" icon="trash" onClick={() => void remove()}>
              Delete permanently
            </Button>
          </>
        }
      />
    </div>
  );
}
