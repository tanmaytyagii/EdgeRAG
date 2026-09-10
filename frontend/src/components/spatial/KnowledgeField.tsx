import { useEffect, useRef } from "react";
import { useIsLive, useSpatialLevel } from "./useSpatial";

/** The knowledge field: the faint spatial substrate the whole app sits on.
 *
 *  Sparse nodes drifting on two depth planes, with a hairline drawn between any
 *  two that come close — a vector space, sampled. It is deliberately almost
 *  invisible (a few percent alpha) and sits behind every surface, so it can
 *  never touch text contrast or focus rings.
 *
 *  One canvas for the whole application, paused whenever it is off screen or
 *  the tab is hidden. Reduced motion paints a single static frame; small
 *  screens get nothing at all.
 */
export function KnowledgeField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const level = useSpatialLevel();
  const live = useIsLive(wrapperRef);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || level === "reduced") return;

    const context = canvas.getContext("2d");
    if (!context) return;

    // Two planes: the far one is smaller, dimmer and slower, which is what
    // reads as depth.
    const planes = [
      { count: 26, speed: 0.05, radius: 1.0, alpha: 0.55, link: 132 },
      { count: 18, speed: 0.10, radius: 1.6, alpha: 1.0, link: 168 },
    ];

    type Node = { x: number; y: number; vx: number; vy: number; plane: number };
    let nodes: Node[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      nodes = planes.flatMap((plane, index) =>
        Array.from({ length: plane.count }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * plane.speed,
          vy: (Math.random() - 0.5) * plane.speed,
          plane: index,
        })),
      );
    };

    const readColor = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue("--field-line").trim();
      const alpha = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--field-alpha").trim() || "0.06",
      );
      return { rgb: raw || "150 180 255", alpha: Number.isFinite(alpha) ? alpha : 0.06 };
    };

    let colour = readColor();

    const draw = () => {
      context.clearRect(0, 0, width, height);

      for (const node of nodes) {
        const plane = planes[node.plane];
        node.x += node.vx;
        node.y += node.vy;
        // Wrap rather than bounce: no edges, just a continuing space.
        if (node.x < -20) node.x = width + 20;
        if (node.x > width + 20) node.x = -20;
        if (node.y < -20) node.y = height + 20;
        if (node.y > height + 20) node.y = -20;

        context.beginPath();
        context.arc(node.x, node.y, plane.radius, 0, Math.PI * 2);
        context.fillStyle = `rgb(${colour.rgb} / ${colour.alpha * plane.alpha * 1.6})`;
        context.fill();
      }

      // Links, drawn per plane so near and far never connect to each other.
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          if (a.plane !== b.plane) continue;
          const limit = planes[a.plane].link;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.hypot(dx, dy);
          if (distance > limit) continue;
          const strength = (1 - distance / limit) * colour.alpha * planes[a.plane].alpha;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.strokeStyle = `rgb(${colour.rgb} / ${strength})`;
          context.lineWidth = 1;
          context.stroke();
        }
      }
    };

    resize();

    if (level === "off") {
      // Reduced motion still gets the spatial substrate — it simply holds still.
      draw();
      const onResize = () => {
        resize();
        draw();
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    const loop = () => {
      draw();
      frame = requestAnimationFrame(loop);
    };

    const onResize = () => {
      resize();
      colour = readColor();
    };
    window.addEventListener("resize", onResize);

    // Theme changes swap the field's colour without a reload.
    const themeObserver = new MutationObserver(() => {
      colour = readColor();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    if (live) frame = requestAnimationFrame(loop);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      themeObserver.disconnect();
    };
  }, [level, live]);

  // Small screens skip the field entirely: it buys nothing on a phone and
  // costs a canvas.
  if (level === "reduced") return <div ref={wrapperRef} className="hidden" aria-hidden="true" />;

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
