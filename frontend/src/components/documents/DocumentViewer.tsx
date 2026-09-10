import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/hooks";
import { count } from "../../lib/format";
import type { ChunkRecord } from "../../lib/types";
import {
  Badge,
  ErrorState,
  Icon,
  IconButton,
  Skeleton,
  TabPanel,
  Tabs,
  Tooltip,
  cx,
  fileIcon,
  useFocusTrap,
} from "../ui";

/** Reader for a source document.
 *
 *  Three panes at width: page navigation on the left, the document in the
 *  middle, citation context on the right. Narrower viewports fold the rails
 *  into the header and a horizontal page strip.
 *
 *  "Extracted text" renders the exact chunks that were indexed, so the
 *  highlighted passage is literally the text the model was given. "Original
 *  file" hands the PDF to the browser's viewer at the cited page.
 */
export function DocumentViewer({
  documentId,
  chunkId,
  page,
  filename,
  onClose,
}: {
  documentId: string;
  chunkId?: string | null;
  page?: number | null;
  filename?: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"text" | "original">("text");
  const {
    data: chunks,
    loading,
    error,
    refresh,
  } = useAsync<ChunkRecord[]>(() => api.documentChunks(documentId), [documentId]);
  const targetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isPdf = (filename ?? "").toLowerCase().endsWith(".pdf");

  const pages = useMemo(() => {
    if (!chunks) return [];
    const grouped = new Map<number | null, ChunkRecord[]>();
    for (const chunk of chunks) {
      const list = grouped.get(chunk.page) ?? [];
      list.push(chunk);
      grouped.set(chunk.page, list);
    }
    return [...grouped.entries()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  }, [chunks]);

  const citedChunk = useMemo(
    () => (chunkId ? (chunks?.find((chunk) => chunk.id === chunkId) ?? null) : null),
    [chunks, chunkId],
  );

  // Jumping to a citation should land on the passage, not near it.
  useEffect(() => {
    if (mode === "text" && chunkId && chunks) {
      requestAnimationFrame(() => targetRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
    }
  }, [mode, chunkId, chunks]);

  const goToPage = (pageNumber: number | null) => {
    const node = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${String(pageNumber)}"]`);
    node?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-line bg-surface">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon name={fileIcon(filename ?? "")} size={16} className="text-faint" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-fg" title={filename}>
            {filename ?? "Document"}
          </p>
          {page !== null && page !== undefined && (
            <p className="font-mono text-2xs text-faint">page {page}</p>
          )}
        </div>
        <Tooltip label="Download the original file">
          <a
            href={api.documentFileUrl(documentId)}
            download
            aria-label="Download the original file"
            className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-raised hover:text-fg"
          >
            <Icon name="download" size={15} />
          </a>
        </Tooltip>
        <IconButton icon="close" label="Close document" size="sm" onClick={onClose} />
      </div>

      <Tabs
        idPrefix="viewer"
        className="px-3"
        value={mode}
        onChange={setMode}
        options={[
          { value: "text", label: "Extracted text", count: chunks?.length },
          ...(isPdf ? [{ value: "original" as const, label: "Original file" }] : []),
        ]}
      />

      {/* Narrow viewports get the page strip here instead of a left rail. */}
      {mode === "text" && pages.length > 1 && pages[0][0] !== null && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-1.5 lg:hidden">
          {pages.map(([pageNumber]) => (
            <button
              key={String(pageNumber)}
              onClick={() => goToPage(pageNumber)}
              className={cx(
                "shrink-0 rounded px-2 py-0.5 font-mono text-2xs transition-colors",
                pageNumber === page ? "bg-accent/15 text-accent" : "text-muted hover:bg-raised hover:text-fg",
              )}
            >
              {pageNumber}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left rail: page navigation */}
        {mode === "text" && pages.length > 1 && pages[0][0] !== null && (
          <nav
            aria-label="Pages"
            className="hidden w-14 shrink-0 overflow-y-auto border-r border-line py-2 lg:block"
          >
            {pages.map(([pageNumber, pageChunks]) => (
              <button
                key={String(pageNumber)}
                onClick={() => goToPage(pageNumber)}
                aria-label={`Page ${pageNumber}, ${pageChunks.length} chunk${pageChunks.length === 1 ? "" : "s"}`}
                title={`Page ${pageNumber} · ${pageChunks.length} chunk${pageChunks.length === 1 ? "" : "s"}`}
                className={cx(
                  "flex w-full flex-col items-center gap-0.5 px-1 py-1.5 transition-colors",
                  pageNumber === page ? "text-accent" : "text-muted hover:bg-raised hover:text-fg",
                )}
              >
                <span
                  className={cx(
                    "flex h-7 w-7 items-center justify-center rounded border font-mono text-2xs tnum",
                    pageNumber === page ? "border-accent/50 bg-accent/10" : "border-line",
                  )}
                >
                  {pageNumber}
                </span>
                <span className="font-mono text-[9px] text-faint tnum">{pageChunks.length}</span>
              </button>
            ))}
          </nav>
        )}

        {/* Centre: the document */}
        <TabPanel idPrefix="viewer" value={mode} className="min-w-0 flex-1 overflow-hidden">
          <div ref={scrollRef} className="h-full overflow-y-auto">
            {mode === "original" ? (
              <iframe
                title={filename ?? "Document"}
                src={`${api.documentFileUrl(documentId)}#page=${page ?? 1}`}
                className="h-full w-full border-0 bg-ink"
              />
            ) : loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-20 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="p-4">
                <ErrorState error={error} onRetry={refresh} />
              </div>
            ) : pages.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] leading-relaxed text-muted">
                This document has no indexed chunks. Re-index it from the Documents page.
              </p>
            ) : (
              <div className="space-y-5 p-4">
                {pages.map(([pageNumber, pageChunks]) => (
                  <section key={String(pageNumber)} data-page={String(pageNumber)}>
                    {pageNumber !== null && (
                      <h3 className="sticky top-0 z-10 -mx-4 mb-2 border-b border-line bg-surface/95 px-4 py-1.5 font-mono text-2xs text-faint backdrop-blur">
                        page {pageNumber}
                      </h3>
                    )}
                    <div className="space-y-2">
                      {pageChunks.map((chunk) => {
                        const isTarget = chunk.id === chunkId;
                        return (
                          <div
                            key={chunk.id}
                            ref={isTarget ? targetRef : undefined}
                            className={cx(
                              "rounded-lg border p-3 text-[13px] leading-relaxed transition-colors",
                              isTarget
                                ? "cite-flash border-accent/50 bg-accent/[0.08] text-fg"
                                : "border-line bg-ink text-fg/75",
                            )}
                          >
                            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-2xs text-faint tnum">
                              <span>chunk {chunk.ordinal}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                chars {chunk.char_start}–{chunk.char_end}
                              </span>
                              {isTarget && (
                                <Badge tone="accent" icon="quote">
                                  cited passage
                                </Badge>
                              )}
                            </div>
                            {chunk.text}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </TabPanel>

        {/* Right: citation context. Only shown when there is something to say
            and there is room to say it. */}
        {mode === "text" && citedChunk && (
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-l border-line p-3 2xl:block">
            <h3 className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-faint">
              <Icon name="quote" size={12} />
              Cited passage
            </h3>
            <dl className="mt-2.5 space-y-2">
              <Meta label="Document" value={citedChunk.document_name} />
              {citedChunk.page !== null && <Meta label="Page" value={String(citedChunk.page)} mono />}
              <Meta label="Chunk" value={`#${citedChunk.ordinal}`} mono />
              <Meta label="Characters" value={`${citedChunk.char_start}–${citedChunk.char_end}`} mono />
              <Meta label="Length" value={`${count(citedChunk.text.length)} chars`} mono />
            </dl>
            <p className="mt-3 border-t border-line pt-2.5 text-2xs leading-relaxed text-muted">
              This is the exact text the model was given for this citation.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-2xs text-muted">{label}</dt>
      <dd className={cx("mt-0.5 break-words text-2xs text-fg", mono && "font-mono tnum")}>{value}</dd>
    </div>
  );
}

/** The viewer as a drawer: an overlay panel below `xl`, an inline column at
 *  `xl` and above where the workspace is wide enough to hold both. */
export function DocumentViewerDrawer(props: React.ComponentProps<typeof DocumentViewer> & { open: boolean }) {
  const { open, ...rest } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState(() => !window.matchMedia("(min-width: 1280px)").matches);

  // Below xl the drawer covers the page, so it behaves as a dialog: trapped
  // focus and Escape to dismiss. Inline at xl and above, it is just a column.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => setOverlay(!query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useFocusTrap(panelRef, open && overlay, rest.onClose);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-drawer animate-fade-in xl:hidden"
        style={{ background: "rgb(var(--overlay) / var(--overlay-alpha))" }}
        onClick={rest.onClose}
      />
      <div
        ref={panelRef}
        role={overlay ? "dialog" : undefined}
        aria-modal={overlay ? true : undefined}
        aria-label={overlay ? `${rest.filename ?? "Document"} viewer` : undefined}
        tabIndex={overlay ? -1 : undefined}
        className={cx(
          "fixed inset-y-0 right-0 z-modal w-full max-w-xl animate-slide-in-right",
          "xl:relative xl:z-auto xl:w-[440px] xl:max-w-none xl:animate-none 2xl:w-[660px]",
        )}
      >
        <DocumentViewer {...rest} />
      </div>
    </>
  );
}
