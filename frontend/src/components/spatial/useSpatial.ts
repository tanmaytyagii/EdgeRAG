import { useEffect, useRef, useState } from "react";

/** How much spatial effect this viewport should receive.
 *
 *  `off`     — the user asked for reduced motion. Nothing moves, ever.
 *  `reduced` — small screens: depth and elevation, no parallax or particles.
 *  `full`    — desktop: the whole spatial treatment.
 */
export type SpatialLevel = "off" | "reduced" | "full";

export function useSpatialLevel(): SpatialLevel {
  const [level, setLevel] = useState<SpatialLevel>(() => resolveLevel());

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 1024px)");
    const update = () => setLevel(resolveLevel());
    motion.addEventListener("change", update);
    wide.addEventListener("change", update);
    return () => {
      motion.removeEventListener("change", update);
      wide.removeEventListener("change", update);
    };
  }, []);

  return level;
}

function resolveLevel(): SpatialLevel {
  if (typeof window === "undefined") return "off";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "off";
  return window.matchMedia("(min-width: 1024px)").matches ? "full" : "reduced";
}

/** True while `ref` is on screen and the tab is visible.
 *
 *  Every animation in the spatial layer is gated on this, so nothing burns a
 *  frame painting a canvas that has scrolled away or a tab nobody is looking
 *  at. */
export function useIsLive(ref: React.RefObject<Element>): boolean {
  const [live, setLive] = useState(false);
  const onScreen = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const sync = () => setLive(onScreen.current && document.visibilityState === "visible");

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen.current = entry.isIntersecting;
        sync();
      },
      { rootMargin: "80px" },
    );
    observer.observe(node);
    document.addEventListener("visibilitychange", sync);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [ref]);

  return live;
}

/** Cursor position over `ref`, as -1..1 on each axis, written straight to CSS
 *  custom properties so parallax never triggers a React render. */
export function usePointerParallax(
  ref: React.RefObject<HTMLElement>,
  enabled: boolean,
): void {
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;

    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const tick = () => {
      // Ease toward the pointer so the layers glide rather than snap.
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      node.style.setProperty("--px", currentX.toFixed(4));
      node.style.setProperty("--py", currentY.toFixed(4));
      frame = Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001
        ? requestAnimationFrame(tick)
        : 0;
    };

    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      targetY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      start();
    };

    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      start();
    };

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
      node.style.removeProperty("--px");
      node.style.removeProperty("--py");
    };
  }, [ref, enabled]);
}
