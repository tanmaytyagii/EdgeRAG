import type { Citation } from "../../lib/types";
import { score as fmtScore } from "../../lib/format";
import { HoverCard, Icon, cx } from "../ui";

/** Renders a generated answer.
 *
 *  Two jobs. First, light structure: paragraphs, bullet and numbered lists,
 *  fenced code and inline code, so a multi-part answer reads as one. Anything
 *  the formatter does not recognise falls through as literal text — the model's
 *  words are never dropped or rewritten.
 *
 *  Second, citations: `[n]` markers become chips that preview their source on
 *  hover and open it on click. A marker is only made interactive when it maps
 *  to a citation the backend actually returned, so a chip never leads nowhere.
 */
export function AnswerBody({
  text,
  citations,
  onCitation,
  streaming,
}: {
  text: string;
  citations: Citation[];
  onCitation?: (citation: Citation) => void;
  streaming?: boolean;
}) {
  const byIndex = new Map(citations.map((citation) => [citation.index, citation]));
  const blocks = parseBlocks(text);

  return (
    <div className={cx("reading max-w-prose", streaming && "[&>*:last-child]:after:content-none")}>
      {blocks.map((block, blockIndex) => {
        const last = blockIndex === blocks.length - 1;

        if (block.kind === "code") {
          return (
            <pre key={blockIndex}>
              <code>{block.lines.join("\n")}</code>
            </pre>
          );
        }

        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={blockIndex}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inline text={item} byIndex={byIndex} onCitation={onCitation} />
                </li>
              ))}
            </List>
          );
        }

        return (
          <p key={blockIndex} className={cx(streaming && last && "caret")}>
            <Inline text={block.text} byIndex={byIndex} onCitation={onCitation} />
          </p>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- inline text */

function Inline({
  text,
  byIndex,
  onCitation,
}: {
  text: string;
  byIndex: Map<number, Citation>;
  onCitation?: (citation: Citation) => void;
}) {
  // Split on citation markers, inline code and bold, all in one pass so the
  // pieces cannot overlap.
  const parts = text.split(/(\[\d{1,2}\]|`[^`\n]+`|\*\*[^*\n]+\*\*)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;

        const marker = /^\[(\d{1,2})\]$/.exec(part);
        if (marker) {
          const citation = byIndex.get(Number(marker[1]));
          // An unresolved marker stays literal text rather than becoming a
          // chip that goes nowhere.
          if (!citation) return <span key={index}>{part}</span>;
          return <CitationChip key={index} citation={citation} onOpen={onCitation} />;
        }

        if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
          return <code key={index}>{part.slice(1, -1)}</code>;
        }

        if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }

        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

/** The signature element: a numbered chip that shows where the claim came from
 *  before you commit to opening it. */
export function CitationChip({
  citation,
  onOpen,
}: {
  citation: Citation;
  onOpen?: (citation: Citation) => void;
}) {
  const location = `${citation.document_name}${citation.page !== null ? ` · p. ${citation.page}` : ""}`;

  return (
    <HoverCard
      className="align-baseline"
      content={
        <span className="block">
          <span className="flex items-baseline gap-1.5">
            <Icon name="quote" size={12} className="translate-y-0.5 text-accent" />
            <span className="min-w-0 flex-1 truncate text-2xs font-medium text-fg">{citation.document_name}</span>
            {citation.page !== null && (
              <span className="shrink-0 font-mono text-2xs text-faint">p. {citation.page}</span>
            )}
          </span>
          <span className="mt-1.5 block max-h-24 overflow-hidden text-2xs leading-relaxed text-muted">
            {citation.excerpt}
          </span>
          {citation.score !== null && (
            <span className="mt-1.5 block font-mono text-2xs text-faint tnum">
              relevance {fmtScore(citation.score, 2)}
            </span>
          )}
          {onOpen && <span className="mt-1.5 block text-2xs text-accent">Click to open the source</span>}
        </span>
      }
    >
      <button
        type="button"
        onClick={() => onOpen?.(citation)}
        aria-label={`Citation ${citation.index}: ${location}. Open the source.`}
        className={cx(
          "mx-px inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-sm border px-1 align-[1px]",
          "border-accent/40 bg-accent/10 font-mono text-2xs text-accent transition-colors duration-150",
          "hover:border-accent hover:bg-accent/20",
        )}
      >
        {citation.index}
      </button>
    </HoverCard>
  );
}

/* ----------------------------------------------------------- block parsing */

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; lines: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const ORDERED = /^\s*\d{1,2}[.)]\s+(.*)$/;

/** A deliberately small block parser: fenced code, bullet lists, numbered
 *  lists, and paragraphs separated by blank lines. Everything else is a
 *  paragraph, which is the safe default while text is still streaming in. */
function parseBlocks(text: string): Block[] {
  if (!text) return [{ kind: "paragraph", text: "" }];

  const lines = text.split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", text: paragraph.join("\n").trim() });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    // Fenced code: collect until the closing fence, or to the end while the
    // answer is still streaming.
    if (/^\s*```/.test(line)) {
      flushParagraph();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: "code", lines: code });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const items: string[] = [(bullet ?? ordered)![1]];
      let next = index + 1;
      while (next < lines.length) {
        const candidate = isOrdered ? ORDERED.exec(lines[next]) : BULLET.exec(lines[next]);
        if (!candidate) break;
        items.push(candidate[1]);
        next += 1;
      }
      blocks.push({ kind: "list", ordered: isOrdered, items });
      index = next - 1;
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks.length > 0 ? blocks : [{ kind: "paragraph", text: "" }];
}
