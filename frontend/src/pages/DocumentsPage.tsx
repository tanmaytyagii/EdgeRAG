import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { toApiError } from "../lib/errors";
import { bytes, count, relativeTime } from "../lib/format";
import { useAsync, usePolling } from "../lib/hooks";
import type { ApiError, DocumentRecord, DocumentStatus } from "../lib/types";
import { DocumentViewerDrawer } from "../components/documents/DocumentViewer";
import { PageBody, PageHeader } from "../components/layout/PageHeader";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Menu,
  Modal,
  Progress,
  SkeletonRows,
  Spinner,
  cx,
  useToast,
  type Tone,
} from "../components/ui";

/** Ingestion stages, in the order the backend reports them. */
const STAGES = ["parsing", "chunking", "embedding", "indexing", "validating", "ready"];

/** A file that has been handed to the browser but whose upload request has not
 *  come back yet. Tracked separately from the server list because the server
 *  does not know about it until the POST completes. */
interface PendingUpload {
  name: string;
  size: number;
}

const STATUS_TONE: Record<DocumentStatus, Tone> = {
  ready: "both",
  processing: "accent",
  pending: "accent",
  failed: "danger",
  cancelled: "warn",
};

/** ".md" -> "MD". Falls back to "FILE" for a name with no extension. */
function extensionOf(filename: string): string {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(filename);
  return match ? match[1].toUpperCase() : "FILE";
}

export function DocumentsPage() {
  const { activeKb, settings, refreshKnowledgeBases } = useApp();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<PendingUpload[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState<DocumentRecord | null>(null);
  const [uploadError, setUploadError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState("");

  const { data, loading, error, refresh } = useAsync<DocumentRecord[]>(
    () => (activeKb ? api.documents(activeKb.id) : Promise.resolve([])),
    [activeKb?.id],
  );

  const active = data?.some((doc) => doc.status === "pending" || doc.status === "processing") ?? false;
  usePolling(() => {
    void refresh();
  }, 1200, active);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return data ?? [];
    return (data ?? []).filter((doc) => doc.filename.toLowerCase().includes(needle));
  }, [data, filter]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      if (!activeKb) return;
      const list = Array.from(files);
      if (list.length === 0) return;

      setUploadError(null);
      setUploading(list.map((file) => ({ name: file.name, size: file.size })));

      for (const file of list) {
        try {
          await api.uploadDocument(activeKb.id, file);
          toast.push({ tone: "info", title: `Indexing ${file.name}` });
        } catch (caught) {
          const failure = toApiError(caught);
          setUploadError(failure);
          toast.push({ tone: "error", title: `${file.name} was not accepted`, body: failure.message });
        } finally {
          setUploading((current) => current.filter((pending) => pending.name !== file.name));
        }
      }

      void refresh();
      void refreshKnowledgeBases();
    },
    [activeKb, refresh, refreshKnowledgeBases, toast],
  );

  const act = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast.push({ tone: "success", title: message });
      void refresh();
      void refreshKnowledgeBases();
    } catch (caught) {
      toast.push({ tone: "error", title: "That did not work", body: toApiError(caught).message });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    await act(() => api.deleteDocument(target.id), `Removed ${target.filename}`);
  };

  if (!activeKb) {
    return (
      <div>
        <h1 className="sr-only">Documents</h1>
        <EmptyState
          icon="library"
          title="No knowledge base selected"
          body="Create one first, then add documents to it."
        />
      </div>
    );
  }

  const accepted = settings?.uploads.allowed_extensions.join(", ") ?? ".pdf, .txt, .md, .docx";
  const maxSize = settings ? bytes(settings.uploads.max_file_bytes) : "100 MB";
  const readyCount = (data ?? []).filter((doc) => doc.status === "ready").length;

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <PageHeader
          title="Documents"
          description={`Files indexed into ${activeKb.name}. Parsing, chunking and embedding all happen on this machine.`}
          meta={
            data && data.length > 0 ? (
              <>
                <Badge>{count(data.length)} files</Badge>
                <Badge tone="both">{count(readyCount)} indexed</Badge>
                <Badge>{count(activeKb.chunk_count)} chunks</Badge>
              </>
            ) : undefined
          }
          actions={
            <Button variant="primary" size="sm" icon="upload" onClick={() => inputRef.current?.click()}>
              Add documents
            </Button>
          }
        />

        <PageBody className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={accepted}
            /* sr-only keeps this in the accessibility tree, so it needs a name
               of its own even though the drop zone is the visible control. */
            aria-label="Choose documents to upload"
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) void upload(event.target.files);
              event.target.value = "";
            }}
          />

          {/* Drop zone: idle, dragging and uploading are visibly different. */}
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void upload(event.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Add documents by choosing files or dropping them here"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={cx(
              "cursor-pointer rounded-xl border border-dashed px-6 py-9 text-center",
              "transition-[transform,background-color,border-color,box-shadow] duration-200 ease-edge",
              dragging
                ? "raised-surface -translate-y-0.5 scale-[1.006] border-accent bg-accent/5"
                : uploading.length > 0
                  ? "border-line-strong bg-raised"
                  : "border-line hover:border-line-strong hover:bg-surface",
            )}
          >
            {uploading.length > 0 ? (
              <>
                <p className="flex items-center justify-center gap-2 text-[14px] font-medium text-fg">
                  <Spinner className="h-3.5 w-3.5 text-accent" />
                  Uploading {uploading.length} file{uploading.length === 1 ? "" : "s"}…
                </p>
                <p className="mt-1.5 truncate font-mono text-2xs text-muted">
                  {uploading.map((pending) => pending.name).join(", ")}
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raised text-muted">
                  <Icon name="upload" size={17} />
                </div>
                <p className="text-[14px] font-medium text-fg">
                  {dragging ? "Drop to index" : "Drop documents here"}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {accepted} · up to {maxSize} each
                </p>
              </>
            )}
          </div>

          {uploadError && <ErrorState error={uploadError} />}

          {/* Filter — only worth showing once there is something to filter. */}
          {(data?.length ?? 0) > 5 && (
            <div className="flex items-center gap-2">
              <label htmlFor="document-filter" className="sr-only">
                Filter documents by name
              </label>
              <Input
                id="document-filter"
                icon="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter by filename…"
                className="max-w-xs"
              />
              {filter && (
                <span className="font-mono text-2xs text-faint tnum">
                  {visible.length} of {data?.length}
                </span>
              )}
            </div>
          )}

          {loading && !data ? (
            <SkeletonRows rows={4} />
          ) : error ? (
            <ErrorState error={error} onRetry={refresh} />
          ) : (data?.length ?? 0) === 0 ? (
            <EmptyState
              icon="documents"
              title="No documents yet"
              body="Add a PDF, Markdown file, plain text file or Word document and EdgeRAG will index it locally."
              action={
                <Button variant="primary" icon="upload" onClick={() => inputRef.current?.click()}>
                  Add documents
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              compact
              icon="search"
              title="No matching documents"
              body={`Nothing in ${activeKb.name} matches “${filter.trim()}”.`}
              action={
                <Button size="sm" onClick={() => setFilter("")}>
                  Clear the filter
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {visible.map((doc) => {
                // One definition of what you can do to a document, rendered by
                // both the desktop row and the phone card below.
                const actions = [
                  ...(doc.status === "ready"
                    ? [{ label: "Open", icon: "eye" as const, onSelect: () => setViewerId(doc.id) }]
                    : []),
                  {
                    label: "Re-index",
                    icon: "refresh" as const,
                    onSelect: () => void act(() => api.reindexDocument(doc.id), "Re-indexing"),
                  },
                  ...(doc.logs.length > 0
                    ? [{ label: "Ingestion log", icon: "terminal" as const, onSelect: () => setLogsFor(doc) }]
                    : []),
                  { label: "Remove", icon: "trash" as const, danger: true, onSelect: () => setDeleting(doc) },
                ];
                const cancellable = doc.status === "processing" || doc.status === "pending";
                const openable = doc.status === "ready";

                return (
                <li key={doc.id} className="relative bg-surface transition-colors duration-150 hover:z-10 hover:bg-raised/40">
                  {/* ---------------------------------------------- desktop row
                      A dense line: the scannable form when there is width for
                      it. Unchanged from the layout this page has always had. */}
                  <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 md:flex">
                    <span
                      className="flex h-6 w-9 shrink-0 items-center justify-center rounded border border-line bg-raised font-mono text-[10px] uppercase tracking-wide text-muted"
                      aria-hidden="true"
                    >
                      {extensionOf(doc.filename)}
                    </span>

                    <button
                      onClick={() => openable && setViewerId(doc.id)}
                      disabled={!openable}
                      className={cx(
                        // `press` only asserts a touch minimum below 1024px or
                        // on a coarse pointer, where the row is already 64px
                        // tall for the menu button — so the hit area grows and
                        // the row does not.
                        "press min-w-0 flex-1 truncate rounded text-left text-[13px] text-fg",
                        openable ? "hover:underline" : "cursor-default",
                      )}
                      title={doc.filename}
                    >
                      {doc.filename}
                    </button>

                    <Badge tone={STATUS_TONE[doc.status]} className="shrink-0">
                      {doc.status}
                    </Badge>

                    {/* Fixed widths so the numbers line up down the list. */}
                    <div className="flex shrink-0 items-center gap-3 font-mono text-2xs text-faint tnum">
                      <span className="w-8 text-right">{doc.page_count > 0 ? `${count(doc.page_count)}p` : ""}</span>
                      <span className="w-20 text-right">
                        {doc.chunk_count > 0 ? `${count(doc.chunk_count)} chunks` : ""}
                      </span>
                      <span className="w-16 text-right">{bytes(doc.size_bytes)}</span>
                      <span className="w-16 text-right">{relativeTime(doc.created_at)}</span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {cancellable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void act(() => api.cancelDocument(doc.id), "Cancelling")}
                        >
                          Cancel
                        </Button>
                      )}
                      <Menu label={`Actions for ${doc.filename}`} items={actions} />
                    </div>
                  </div>

                  {/* ----------------------------------------------- phone card
                      A row squeezed into 390px turns the filename — the one
                      field that identifies the document — into three ellipsised
                      characters. On a phone the card leads with the full name
                      over two lines and labels every figure, because a bare
                      "4p · 9 chunks" means nothing without its nouns. */}
                  <div className="px-3 py-3 md:hidden">
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 flex h-6 w-9 shrink-0 items-center justify-center rounded border border-line bg-raised font-mono text-[10px] uppercase tracking-wide text-muted"
                        aria-hidden="true"
                      >
                        {extensionOf(doc.filename)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => openable && setViewerId(doc.id)}
                          disabled={!openable}
                          className={cx(
                            "press -my-1.5 flex w-full items-center rounded py-1.5 text-left text-[13px] leading-snug text-fg",
                            // Two lines of a real filename beat one line of an
                            // ellipsis; the title carries the rest either way.
                            "line-clamp-2 break-words",
                            openable ? "hover:underline" : "cursor-default",
                          )}
                          title={doc.filename}
                        >
                          {doc.filename}
                        </button>
                        <Badge tone={STATUS_TONE[doc.status]} className="mt-1">
                          {doc.status}
                        </Badge>
                      </div>

                      <Menu label={`Actions for ${doc.filename}`} items={actions} />
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-2.5">
                      {doc.page_count > 0 && (
                        <div>
                          <dt className="text-2xs text-muted">Pages</dt>
                          <dd className="font-mono text-[13px] text-fg tnum">{count(doc.page_count)}</dd>
                        </div>
                      )}
                      {doc.chunk_count > 0 && (
                        <div>
                          <dt className="text-2xs text-muted">Chunks</dt>
                          <dd className="font-mono text-[13px] text-fg tnum">{count(doc.chunk_count)}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-2xs text-muted">Size</dt>
                        <dd className="font-mono text-[13px] text-fg tnum">{bytes(doc.size_bytes)}</dd>
                      </div>
                      <div>
                        <dt className="text-2xs text-muted">Added</dt>
                        <dd className="font-mono text-[13px] text-fg tnum">{relativeTime(doc.created_at)}</dd>
                      </div>
                    </dl>

                    {cancellable && (
                      <Button
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => void act(() => api.cancelDocument(doc.id), "Cancelling")}
                      >
                        Cancel indexing
                      </Button>
                    )}
                  </div>

                  {(doc.status === "processing" || doc.status === "pending") && (
                    <div className="px-3 pb-3">
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        {STAGES.map((stage) => {
                          const reached = STAGES.indexOf(doc.stage) >= STAGES.indexOf(stage);
                          const current = doc.stage === stage;
                          return (
                            <Badge
                              key={stage}
                              tone={current ? "accent" : reached ? "both" : "neutral"}
                              className={cx(!reached && "opacity-45")}
                            >
                              {stage}
                            </Badge>
                          );
                        })}
                      </div>
                      <Progress value={doc.progress} label={`${doc.filename}: ${doc.stage}`} />
                    </div>
                  )}

                  {doc.status === "failed" && doc.error && (
                    <div className="px-3 pb-3">
                      <ErrorState
                        error={{
                          code: "document_parse_failed",
                          message: doc.error,
                          remediation: "Fix the file, then re-index it.",
                        }}
                        onRetry={() => void act(() => api.reindexDocument(doc.id), "Re-indexing")}
                        retryLabel="Re-index"
                      />
                    </div>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </PageBody>
      </div>

      {viewerId && (
        <DocumentViewerDrawer
          open
          documentId={viewerId}
          filename={data?.find((doc) => doc.id === viewerId)?.filename}
          page={1}
          chunkId={null}
          onClose={() => setViewerId(null)}
        />
      )}

      <Modal
        open={Boolean(logsFor)}
        onClose={() => setLogsFor(null)}
        title="Ingestion log"
        description={logsFor?.filename}
        wide
        footer={<Button onClick={() => setLogsFor(null)}>Close</Button>}
      >
        <ol className="space-y-1.5">
          {logsFor?.logs.map((entry, index) => (
            <li key={index} className="flex gap-3 font-mono text-2xs">
              <span className="shrink-0 text-faint">{new Date(entry.at).toLocaleTimeString()}</span>
              <span className="text-fg/85">{entry.message}</span>
            </li>
          ))}
        </ol>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Remove ${deleting?.filename}?`}
        description="Its chunks and embeddings are deleted from this knowledge base. The original file is removed from EdgeRAG's storage."
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Keep it</Button>
            <Button variant="danger" icon="trash" onClick={() => void confirmDelete()}>
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}
