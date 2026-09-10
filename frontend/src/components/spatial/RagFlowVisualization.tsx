import { useEffect, useRef, type ReactNode } from "react";
import { Icon, cx, type IconName } from "../ui";
import { useIsLive, usePointerParallax, useSpatialLevel } from "./useSpatial";

/** The landing hero centrepiece: EdgeRAG's architecture, drawn as a space.
 *
 *  Documents at the top fan into the two retrievers, which converge on the
 *  fusion core — the focal point — and from there the answer descends through
 *  reranking, context and the local model.
 *
 *  Nodes are DOM (so they stay legible, selectable and translatable); the
 *  connectors and the particles flowing along them are one small canvas sharing
 *  the same normalised coordinate space, which is what keeps them aligned at
 *  any size. Everything animated is gated on visibility and on the user's
 *  motion preference.
 *
 *  This is a picture of the architecture, not a readout: it carries no numbers,
 *  because the real ones belong to a real query and live inside the app.
 */

/* Normalised layout, shared by the DOM nodes and the canvas. x/y are percent. */
const POINTS = {
  documents: { x: 50, y: 7 },
  dense: { x: 20, y: 26 },
  sparse: { x: 80, y: 26 },
  core: { x: 50, y: 45 },
  rerank: { x: 50, y: 61 },
  context: { x: 50, y: 74 },
  model: { x: 50, y: 86 },
  answer: { x: 50, y: 96 },
} as const;

type PointName = keyof typeof POINTS;

/** Every edge in the graph, with the lane colour its particles carry. */
const EDGES: { from: PointName; to: PointName; lane: "dense" | "sparse" | "spine" }[] = [
  { from: "documents", to: "dense", lane: "dense" },
  { from: "documents", to: "sparse", lane: "sparse" },
  { from: "dense", to: "core", lane: "dense" },
  { from: "sparse", to: "core", lane: "sparse" },
  { from: "core", to: "rerank", lane: "spine" },
  { from: "rerank", to: "context", lane: "spine" },
  { from: "context", to: "model", lane: "spine" },
  { from: "model", to: "answer", lane: "spine" },
];

export function RagFlowVisualization({ className }: { className?: string }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const level = useSpatialLevel();
  const live = useIsLive(sceneRef);

  usePointerParallax(sceneRef, level === "full");

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let frame = 0;

    const at = (p: { x: number; y: number }) => ({ x: (p.x / 100) * width, y: (p.y / 100) * height });

    const readVar = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "120 140 180";

    let colours = {
      dense: readVar("--dense"),
      sparse: readVar("--sparse"),
      spine: readVar("--accent"),
      line: readVar("--line-strong"),
    };

    // Particles are spread along each edge at a fixed density, so the flow
    // reads as steady rather than bursty.
    const particles = EDGES.flatMap((edge, index) =>
      Array.from({ length: 3 }, (_, slot) => ({
        edge,
        t: (slot / 3 + index * 0.17) % 1,
        speed: 0.0016 + (index % 3) * 0.0004,
      })),
    );

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const drawEdges = () => {
      for (const edge of EDGES) {
        const a = at(POINTS[edge.from]);
        const b = at(POINTS[edge.to]);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.strokeStyle = `rgb(${colours.line} / 0.55)`;
        context.lineWidth = Math.max(1, width * 0.0022);
        context.stroke();
      }
    };

    const drawParticles = () => {
      for (const particle of particles) {
        const a = at(POINTS[particle.edge.from]);
        const b = at(POINTS[particle.edge.to]);
        const x = a.x + (b.x - a.x) * particle.t;
        const y = a.y + (b.y - a.y) * particle.t;
        // Fade in and out at the ends so nothing pops at a node.
        const fade = Math.sin(particle.t * Math.PI);
        const rgb = colours[particle.edge.lane];
        context.beginPath();
        // Particle size tracks the diagram so the flow reads the same at any scale.
        context.arc(x, y, Math.max(1.4, width * 0.0042), 0, Math.PI * 2);
        context.fillStyle = `rgb(${rgb} / ${0.75 * fade})`;
        context.fill();
      }
    };

    const render = (animate: boolean) => {
      context.clearRect(0, 0, width, height);
      drawEdges();
      if (animate) {
        for (const particle of particles) {
          particle.t += particle.speed;
          if (particle.t > 1) particle.t -= 1;
        }
        drawParticles();
      }
    };

    resize();

    const themeObserver = new MutationObserver(() => {
      colours = {
        dense: readVar("--dense"),
        sparse: readVar("--sparse"),
        spine: readVar("--accent"),
        line: readVar("--line-strong"),
      };
      render(false);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const onResize = () => {
      resize();
      render(false);
    };
    window.addEventListener("resize", onResize);

    // The diagram can change size without the window doing so — a sidebar
    // opening, a container query flipping the hero to two columns. Observe the
    // element itself so the canvas always matches its box.
    const sizeObserver = new ResizeObserver(onResize);
    sizeObserver.observe(canvas);

    if (level === "off" || !live) {
      // Static: the diagram still reads correctly with nothing moving.
      render(false);
    } else {
      const loop = () => {
        render(true);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      sizeObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [level, live]);

  const parallax = level === "full";

  return (
    <div
      ref={sceneRef}
      /* `rag-frame` carries the default proportions from the components layer;
         a caller can override them from the utilities layer (see `.rag-viz`). */
      className={cx("rag-frame scene relative isolate w-full select-none", className)}
      role="img"
      aria-label={
        "EdgeRAG's retrieval architecture: documents feed dense and BM25 retrieval, " +
        "which converge on reciprocal rank fusion, then reranking, top context, the local model, " +
        "and finally a grounded answer."
      }
    >
      {/* Connectors and information flow. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

      {/* Floating document layer — the furthest plane, so it drifts least. */}
      <Layer point={POINTS.documents} depth={parallax ? 5 : 0}>
        <div className="flex -space-x-3">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="rag-doc flex items-center justify-center rounded-[3px] border border-line-strong bg-surface shadow-sm"
              style={{
                transform: `rotate(${(index - 1) * 7}deg) translateY(${Math.abs(index - 1) * 2}px)`,
              }}
            >
              <Icon name="file" size={11} className="w-1/2 text-faint" />
            </span>
          ))}
        </div>
        <Caption>Documents</Caption>
      </Layer>

      {/* The two retrieval lanes. */}
      <Layer point={POINTS.dense} depth={parallax ? 12 : 0}>
        <Chip icon="spark" label="Dense" tone="dense" />
      </Layer>
      <Layer point={POINTS.sparse} depth={parallax ? 12 : 0}>
        <Chip icon="terminal" label="BM25" tone="sparse" />
      </Layer>

      {/* The focal point: the only element that breathes, and the only one
          that carries a halo. */}
      <Layer point={POINTS.core} depth={parallax ? 20 : 0}>
        <div className="relative">
          {level !== "off" && (
            <span
              aria-hidden="true"
              className="absolute -inset-2.5 rounded-xl border border-both/25 motion-safe:animate-[core-breathe_4.5s_ease-in-out_infinite]"
            />
          )}
          <span className="rag-node raised-surface relative flex items-center whitespace-nowrap border border-both/50 bg-surface font-semibold text-fg">
            <Icon name="layers" size={13} className="text-both" />
            Fusion core
          </span>
        </div>
      </Layer>

      <Layer point={POINTS.rerank} depth={parallax ? 14 : 0}>
        <Chip icon="target" label="Reranker" />
      </Layer>
      <Layer point={POINTS.context} depth={parallax ? 11 : 0}>
        <Chip icon="quote" label="Context" />
      </Layer>
      <Layer point={POINTS.model} depth={parallax ? 8 : 0}>
        <Chip icon="cpu" label="Local model" />
      </Layer>
      <Layer point={POINTS.answer} depth={parallax ? 6 : 0}>
        <Chip icon="check" label="Grounded answer" tone="accent" strong />
      </Layer>
    </div>
  );
}

/** Positions a node in the shared coordinate space and gives it its own
 *  parallax rate — nearer things move further. */
function Layer({
  point,
  depth,
  children,
}: {
  point: { x: number; y: number };
  depth: number;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute flex flex-col items-center gap-1"
      style={{
        left: `${point.x}%`,
        top: `${point.y}%`,
        transform: `translate(-50%, -50%) translate3d(calc(var(--px, 0) * ${depth}px), calc(var(--py, 0) * ${depth * 0.6}px), 0)`,
        transition: "transform 120ms linear",
      }}
    >
      {children}
    </div>
  );
}

function Chip({
  icon,
  label,
  tone,
  strong,
}: {
  icon: IconName;
  label: string;
  tone?: "dense" | "sparse" | "both" | "accent";
  strong?: boolean;
}) {
  const border = tone
    ? { dense: "border-dense/40", sparse: "border-sparse/40", both: "border-both/45", accent: "border-accent/45" }[tone]
    : "border-line";
  const text = tone
    ? { dense: "text-dense", sparse: "text-sparse", both: "text-both", accent: "text-accent" }[tone]
    : "text-faint";

  return (
    <span
      className={cx(
        "rag-node flex items-center whitespace-nowrap border bg-surface font-medium text-fg",
        border,
        strong ? "raised-surface" : "surface-1",
      )}
    >
      <Icon name={icon} size={12} className={text} />
      {label}
    </span>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <span className="rag-caption uppercase tracking-wider text-faint">{children}</span>;
}
