import type { Citation } from "../../lib/types";
import { score } from "../../lib/format";
import { Icon, cx, fileIcon } from "../ui";

/** Sources under an answer, in citation order.
 *
 *  Each row states exactly where the claim came from — `document · p. n` — and
 *  opens that passage. Every field is metadata the backend returned; nothing is
 *  inferred or filled in.
 */
export function CitationList({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (citation: Citation) => void;
}) {
  if (citations.length === 0) return null;

  return (
    <section className="mt-4 border-t border-line pt-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-faint">
        <Icon name="quote" size={12} />
        {citations.length} source{citations.length === 1 ? "" : "s"}
      </h3>
      <ol className="space-y-1.5">
        {citations.map((citation) => (
          <li key={citation.index}>
            <button
              onClick={() => onOpen(citation)}
              className={cx(
                "lift group flex w-full items-start gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-left",
                "hover:border-line-strong hover:bg-raised",
              )}
            >
              <span className="mt-px flex h-[17px] min-w-[17px] items-center justify-center rounded-sm border border-accent/40 bg-accent/10 px-1 font-mono text-2xs text-accent">
                {citation.index}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <Icon
                    name={fileIcon(citation.document_name)}
                    size={12}
                    className="translate-y-0.5 shrink-0 text-faint"
                  />
                  <span className="truncate text-2xs font-medium text-fg">{citation.document_name}</span>
                  {citation.page !== null && (
                    <span className="shrink-0 font-mono text-2xs text-faint">· p. {citation.page}</span>
                  )}
                  {citation.score !== null && (
                    <span className="ml-auto shrink-0 font-mono text-2xs text-faint tnum">
                      {score(citation.score, 2)}
                    </span>
                  )}
                </span>
                <span className="mt-1 block line-clamp-2 text-2xs leading-relaxed text-muted">
                  {citation.excerpt}
                </span>
              </span>

              <Icon
                name="chevronRight"
                size={13}
                className="mt-0.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
