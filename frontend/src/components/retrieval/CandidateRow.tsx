import { score as fmtScore } from "../../lib/format";
import type { Candidate } from "../../lib/types";
import { Badge, Icon, cx, fileIcon, type Tone } from "../ui";

const STRIPE = { dense: "stripe-dense", sparse: "stripe-sparse", hybrid: "stripe-both" } as const;
const TONE: Record<Candidate["source"], Tone> = { dense: "dense", sparse: "sparse", hybrid: "both" };

export function RetrieverBadge({ source }: { source: Candidate["source"] }) {
  const label = source === "hybrid" ? "both" : source === "sparse" ? "bm25" : "dense";
  return <Badge tone={TONE[source]}>{label}</Badge>;
}

/** One retrieved chunk.
 *
 *  Shows every score the pipeline assigned it — dense, BM25, fusion, rerank —
 *  rather than a blended number no stage actually produced. Scores that a stage
 *  did not compute are simply absent.
 */
export function CandidateRow({
  candidate,
  rank,
  primaryScore,
  onOpen,
  selected,
  showBreakdown = false,
}: {
  candidate: Candidate;
  rank: number;
  primaryScore: "rerank" | "fusion" | "dense" | "sparse";
  onOpen?: (candidate: Candidate) => void;
  selected?: boolean;
  /** Reveal every per-stage score. Off by default: the leading score and the
   *  retriever badge answer the common question on their own. */
  showBreakdown?: boolean;
}) {
  const value =
    primaryScore === "rerank"
      ? candidate.rerank_score
      : primaryScore === "fusion"
        ? candidate.fusion_score
        : primaryScore === "dense"
          ? candidate.dense_score
          : candidate.sparse_score;

  const digits = primaryScore === "fusion" ? 5 : primaryScore === "sparse" ? 2 : 3;

  return (
    <li
      className={cx(
        "group border-b border-line bg-surface last:border-b-0",
        STRIPE[candidate.source],
        selected && "bg-raised",
      )}
    >
      <button
        onClick={() => onOpen?.(candidate)}
        disabled={!onOpen}
        aria-label={onOpen ? `Open ${candidate.document_name} at this passage` : undefined}
        className={cx(
          "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors duration-150",
          onOpen ? "hover:bg-raised" : "cursor-default",
        )}
      >
        <span className="mt-0.5 w-6 shrink-0 font-mono text-2xs text-faint tnum">#{rank}</span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <RetrieverBadge source={candidate.source} />
            {selected && (
              <Badge tone="accent" icon="check">
                in context
              </Badge>
            )}
            <Icon name={fileIcon(candidate.document_name)} size={11} className="text-faint" />
            <span className="truncate text-2xs text-muted">
              {candidate.document_name}
              {candidate.page !== null && <span className="text-faint"> · p. {candidate.page}</span>}
            </span>
          </span>

          <span className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-fg/85">
            {candidate.preview}
          </span>

          {/* The per-stage breakdown is the interesting part for someone
              debugging retrieval and noise for everyone else, so it is a
              disclosure rather than a wall of numbers. The badge above already
              says which retrievers found this chunk; these are the scores
              behind that. */}
          {showBreakdown && (
            <span
              className={cx(
                "mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-2xs text-faint tnum",
                "motion-safe:animate-fade-in",
              )}
            >
              {candidate.dense_rank !== null && (
                <span>
                  dense #{candidate.dense_rank} · {fmtScore(candidate.dense_score, 3)}
                </span>
              )}
              {candidate.sparse_rank !== null && (
                <span>
                  bm25 #{candidate.sparse_rank} · {fmtScore(candidate.sparse_score, 2)}
                </span>
              )}
              {candidate.fusion_score !== null && <span>rrf {fmtScore(candidate.fusion_score, 5)}</span>}
            </span>
          )}
        </span>

        <span className="shrink-0 text-right">
          <span className="block font-mono text-[14px] text-fg tnum">{fmtScore(value, digits)}</span>
          <span className="metric">
            {primaryScore === "rerank" ? "rerank" : primaryScore === "fusion" ? "rrf" : primaryScore}
          </span>
        </span>

        {onOpen && (
          <Icon
            name="chevronRight"
            size={13}
            className="mt-1 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </button>
    </li>
  );
}
