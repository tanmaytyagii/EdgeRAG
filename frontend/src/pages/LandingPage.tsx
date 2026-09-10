import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { count } from "../lib/format";
import { useAsync } from "../lib/hooks";
import { GITHUB_OWNER, GITHUB_PROFILE_URL, GITHUB_REPO_URL, LICENSE, TAGLINE } from "../lib/identity";
import type { Overview } from "../lib/types";
import { Lockup, Mark, Wordmark } from "../components/layout/Logo";
import { KnowledgeField } from "../components/spatial/KnowledgeField";
import { RagFlowVisualization } from "../components/spatial/RagFlowVisualization";
import { Badge, Button, Icon, StatusDot, cx } from "../components/ui";

/** The landing shell.
 *
 *  One fluid container shared by every band on the page, so the wordmark, the
 *  headline and the footer always line up. Its width and gutters both grow with
 *  the viewport (see `.shell` in index.css) — there is no fixed desktop size.
 *  Text inside still carries its own reading measure. */
const SHELL = "shell shell-landing";

export function LandingPage() {
  return (
    <div className="relative min-h-screen bg-ink">
      <KnowledgeField />
      <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur">
        <div className={cx(SHELL, "flex h-14 items-center gap-3")}>
          <Lockup />
          <nav className="ml-auto flex items-center gap-1 sm:gap-3" aria-label="Landing page">
            <a href="#how" className="hidden rounded px-2 py-1 text-[13px] text-muted transition-colors hover:text-fg sm:block">
              How it works
            </a>
            <a
              href="#architecture"
              className="hidden rounded px-2 py-1 text-[13px] text-muted transition-colors hover:text-fg sm:block"
            >
              Architecture
            </a>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1.5 rounded px-2 py-1 text-[13px] text-muted transition-colors hover:text-fg"
            >
              <Icon name="github" size={15} />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <Link to="/app">
              <Button size="sm" variant="primary">
                Open EdgeRAG
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <Hero />
        <LivePreview />
        <Why />
        <HowItWorks />
        <Architecture />
        <Developer />
        <Privacy />
      </main>

      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className={cx(SHELL, "hero pb-[clamp(3rem,5vw,6rem)] pt-[clamp(2.5rem,4vw,5rem)]")}>
      <div className="hero-grid">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="both">
              <StatusDot state="ok" />
              runs offline
            </Badge>
            <Badge tone="dense">hybrid retrieval</Badge>
            <Badge tone="sparse">cross-encoder reranking</Badge>
          </div>

          <h1 className="hero-title mt-5 font-semibold text-fg">
            <Wordmark />
          </h1>
          <p className="hero-tagline mt-3 text-fg/90">{TAGLINE}</p>

          <p className="hero-copy mt-5 text-muted">
            EdgeRAG indexes your files on your own machine and answers questions from them. Semantic and
            keyword retrieval run side by side, a cross-encoder reranks what they find, and a local model
            writes the answer — with a citation on every claim that opens the exact passage it came from.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-2">
            <Link to="/app">
              <Button variant="primary" size="lg" iconRight="arrowRight">
                Open EdgeRAG
              </Button>
            </Link>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer noopener">
              <Button size="lg" icon="github">
                View on GitHub
              </Button>
            </a>
          </div>
        </div>

        {/* The pipeline, as the product's actual shape. No numbers here — the
            real ones live in the app, on your own queries. */}
        <div className="min-w-0">
          <p className="mb-[clamp(0.75rem,1.2vw,1.5rem)] text-2xs font-medium uppercase tracking-wider text-faint">
            One question, six stages
          </p>
          <RagFlowVisualization className="rag-viz" />
        </div>
      </div>

      <dl className="mt-[clamp(3rem,4.5vw,5.5rem)] grid gap-x-[clamp(1.5rem,3vw,4rem)] gap-y-6 border-t border-line pt-8 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Local-first", "Documents, embeddings and indexes never leave the machine."],
          ["Hybrid", "Dense semantics and BM25 keywords, fused by reciprocal rank."],
          ["Grounded", "Every claim carries a citation you can open."],
          ["Observable", "Per-stage latency and candidate counts for every query."],
        ].map(([term, definition]) => (
          <div key={term}>
            <dt className="text-card-title font-semibold text-fg">{term}</dt>
            <dd className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-muted">{definition}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A live view of this installation, not a mock screenshot. If the backend is
 *  not running it says so rather than showing invented numbers. */
function LivePreview() {
  const { data, error } = useAsync<Overview>(() => api.overview(), []);

  return (
    <section className={cx(SHELL, "pb-[clamp(3.5rem,5.5vw,7rem)]")}>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex h-9 items-center gap-2 border-b border-line px-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-line-strong" />
            <span className="h-2 w-2 rounded-full bg-line-strong" />
            <span className="h-2 w-2 rounded-full bg-line-strong" />
          </div>
          <span className="ml-2 font-mono text-2xs text-faint">
            {error ? "edgerag — backend not running" : "edgerag — this installation"}
          </span>
        </div>

        {error ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[14px] text-fg">The EdgeRAG backend is not running.</p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
              Start it with <code className="rounded-sm bg-raised px-1 font-mono text-2xs">edgerag serve</code> and this
              panel will show the real state of your index. Nothing here is a placeholder.
            </p>
          </div>
        ) : (
          <div className="grid gap-px bg-line sm:grid-cols-4">
            {[
              ["Knowledge bases", data ? count(data.counts.knowledge_bases) : "—"],
              ["Documents", data ? count(data.counts.documents) : "—"],
              ["Indexed chunks", data ? count(data.counts.chunks) : "—"],
              ["Local model", data?.stack.llm_model ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface px-4 py-5">
                <p className="text-2xs text-muted">{label}</p>
                <p
                  className={cx(
                    "mt-1 font-mono text-fg tnum",
                    String(value).length > 12 ? "text-[15px]" : "text-2xl",
                  )}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-line px-5 py-4">
          <p className="text-2xs text-muted">
            {data && data.counts.documents === 0
              ? "Nothing is indexed yet. Open EdgeRAG and drop in a document to populate this."
              : "These figures are read live from the local index."}
          </p>
        </div>
      </div>
    </section>
  );
}

function Why() {
  const points = [
    {
      title: "One retriever is not enough",
      body: "Dense search understands that turnover and attrition mean the same thing. It reliably misses exact strings like a version number or an error code. BM25 is the mirror image. EdgeRAG runs both and fuses them by rank, so a passage that both retrievers surfaced is promoted over one that only satisfied a single arm.",
    },
    {
      title: "Reranking is where precision comes from",
      body: "Fusion produces recall. A cross-encoder reads the query and each candidate together and reorders forty candidates down to the five that actually answer the question. It is too slow to run over a whole corpus, which is why it belongs at the end of the funnel rather than the start.",
    },
    {
      title: "An answer you cannot check is a guess",
      body: "Every claim is tagged with the excerpt it came from. Clicking a citation opens the source at the exact passage. Markers the model invents are removed before you see them, because a citation that leads nowhere is worse than none.",
    },
    {
      title: "It should refuse when it should refuse",
      body: "When the retrieved evidence is too weak, EdgeRAG says so. Confidence is a blend of the best chunk's score, its margin over the runner-up, how many chunks clear the bar, and whether the two retrievers agreed — not a single threshold on an uncalibrated logit.",
    },
  ];

  return (
    <section className="border-t border-line bg-surface/40">
      <div className={cx(SHELL, "section-y")}>
        <h2 className="text-[24px] font-semibold tracking-tight text-fg">Why EdgeRAG</h2>
        <div className="mt-8 grid gap-x-[clamp(2rem,3.5vw,5rem)] gap-y-8 sm:grid-cols-2">
          {points.map((point) => (
            <div key={point.title} className="rail">
              <h3 className="text-card-title font-semibold text-fg">{point.title}</h3>
              <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted">{point.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const stages = [
    ["Query processing", "The question is normalized and embedded once."],
    ["Dense retrieval", "Cosine search over the local vector index returns semantic candidates."],
    ["BM25 retrieval", "The keyword index returns exact-term candidates."],
    ["Hybrid fusion", "Reciprocal rank fusion merges both lists and rewards agreement."],
    ["Reranking", "A cross-encoder scores the merged pool and keeps the best few."],
    ["Grounded generation", "A local model answers from that context, citing each excerpt."],
  ];

  return (
    <section id="how" className="border-t border-line scroll-mt-16">
      <div className={cx(SHELL, "section-y")}>
        <h2 className="text-[24px] font-semibold tracking-tight text-fg">How a question becomes an answer</h2>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
          Six stages, each of them timed. The application shows you the real numbers for your own queries.
        </p>
        <ol className="mt-8 border-t border-line">
          {stages.map(([title, body], index) => (
            <li
              key={title}
              className="grid gap-2 border-b border-line py-4 sm:grid-cols-[3rem_14rem_1fr] sm:gap-6"
            >
              <span className="font-mono text-2xs text-faint tnum">{String(index + 1).padStart(2, "0")}</span>
              <span className="text-[13px] font-medium text-fg">{title}</span>
              <span className="max-w-prose text-[13px] leading-relaxed text-muted">{body}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Architecture() {
  const rows = [
    ["Ingestion", "PyMuPDF, python-docx, plain text", "Character offsets are preserved so citations can point at an exact passage."],
    ["Chunking", "Recursive character splitter", "800 characters with 100 of overlap by default."],
    ["Embeddings", "sentence-transformers", "all-MiniLM-L6-v2 by default. About 90 MB, CPU friendly."],
    ["Vector store", "NumPy or Chroma", "Exact cosine search, persisted to disk so restarts are free."],
    ["Sparse index", "BM25 Okapi", "Persisted alongside the vectors, rebuilt only when documents change."],
    ["Reranking", "Cross-encoder", "ms-marco-MiniLM-L-6-v2 by default. Optional and clearly reported when off."],
    ["Generation", "Ollama", "Any model your machine can serve. Streams token by token."],
  ];

  return (
    <section id="architecture" className="border-t border-line bg-surface/40 scroll-mt-16">
      <div className={cx(SHELL, "section-y")}>
        <h2 className="text-[24px] font-semibold tracking-tight text-fg">Architecture</h2>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
          Each capability sits behind a provider interface. Swapping Ollama for llama.cpp, or Chroma for
          pgvector, means adding a class — not rewriting the pipeline.
        </p>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <tbody>
              {rows.map(([layer, implementation, note]) => (
                <tr key={layer} className="border-b border-line align-baseline">
                  <th scope="row" className="whitespace-nowrap py-3 pr-6 text-[13px] font-medium text-fg">
                    {layer}
                  </th>
                  <td className="whitespace-nowrap py-3 pr-6 font-mono text-2xs text-dense">{implementation}</td>
                  <td className="py-3 text-[13px] leading-relaxed text-muted">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Developer() {
  return (
    <section className="border-t border-line">
      <div className={cx(SHELL, "section-y")}>
        <h2 className="text-[24px] font-semibold tracking-tight text-fg">Built to be run, not just read</h2>
        <div className="mt-8 grid gap-[clamp(2rem,3vw,4rem)] lg:grid-cols-2">
          <div>
            <p className="max-w-prose text-[13px] leading-relaxed text-muted">
              The RAG engine is importable on its own, with no server and no notebook state. Everything the
              interface does, the command line does too.
            </p>
            <ul className="mt-4 space-y-2">
              {[
                ["edgerag doctor", "Check Python, dependencies, Ollama, models, storage and indexes."],
                ["edgerag ingest ./docs", "Index a directory into a named knowledge base."],
                ['edgerag query "…"', "Ask a question and print the answer with its citations."],
                ["edgerag eval", "Score a knowledge base against your own test questions."],
              ].map(([command, note]) => (
                <li key={command} className="flex flex-wrap items-baseline gap-x-3 border-b border-line pb-2">
                  <code className="font-mono text-2xs text-fg">{command}</code>
                  <span className="text-2xs text-muted">{note}</span>
                </li>
              ))}
            </ul>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-4 font-mono text-2xs leading-relaxed text-muted">
            {`git clone ${GITHUB_REPO_URL}.git
cd EdgeRAG
make setup          # backend deps + frontend build
ollama pull deepseek-r1:1.5b
edgerag doctor      # verify the environment
edgerag serve       # http://localhost:8000`}
          </pre>
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section className="border-t border-line bg-surface/40">
      <div className={cx(SHELL, "section-y")}>
        <h2 className="text-[24px] font-semibold tracking-tight text-fg">Your documents stay on your machine</h2>
        <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-muted">
          EdgeRAG has no accounts, no cloud storage and no analytics endpoint. The only network call it makes
          is to the model host you configure, which defaults to Ollama on localhost. Turn off your network and
          it keeps working.
        </p>
        <div className="mt-5 flex flex-wrap gap-1.5">
          <Badge tone="both" icon="shield">
            no cloud APIs required
          </Badge>
          <Badge tone="both" icon="shield">
            no telemetry
          </Badge>
          <Badge tone="both" icon="shield">
            no account
          </Badge>
          <Badge tone="both" icon="shield">
            works offline
          </Badge>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className={cx(SHELL, "py-[clamp(2.5rem,3.5vw,4.5rem)]")}>
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-fg">
              <Mark size={18} />
              <Wordmark className="text-[15px]" />
            </div>
            <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted">{TAGLINE}</p>
            <p className="mt-3 text-2xs text-faint">{LICENSE}</p>
          </div>

          <div className="flex flex-wrap gap-10">
            <div>
              <p className="text-2xs font-medium uppercase tracking-wider text-faint">GitHub</p>
              <ul className="mt-2 space-y-1.5">
                <li>
                  <a
                    href={GITHUB_REPO_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg"
                  >
                    <Icon name="github" size={14} />
                    EdgeRAG
                  </a>
                </li>
                <li>
                  <a
                    href={GITHUB_PROFILE_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg"
                  >
                    <Icon name="external" size={14} />
                    {GITHUB_OWNER}
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-2xs font-medium uppercase tracking-wider text-faint">Application</p>
              <ul className="mt-2 space-y-1.5">
                <li>
                  <Link to="/app" className="text-[13px] text-muted transition-colors hover:text-fg">
                    Open EdgeRAG
                  </Link>
                </li>
                <li>
                  <Link to="/app/settings" className="text-[13px] text-muted transition-colors hover:text-fg">
                    Settings
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
