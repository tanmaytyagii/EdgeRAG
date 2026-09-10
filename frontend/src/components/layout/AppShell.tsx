import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useApp } from "../../lib/app-context";
import { useHotkey } from "../../lib/hooks";
import { Icon, IconButton, Kbd, Skeleton, StatusDot, cx, useFocusTrap, useScrollLock } from "../ui";
import { KnowledgeField } from "../spatial/KnowledgeField";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";

/** Human-readable name for each route, used by the header's context line. */
const ROUTE_TITLES: Record<string, string> = {
  "/app": "Overview",
  "/app/knowledge-bases": "Knowledge bases",
  "/app/documents": "Documents",
  "/app/chat": "Chat",
  "/app/explorer": "Search explorer",
  "/app/pipeline": "Retrieval pipeline",
  "/app/evaluations": "Evaluations",
  "/app/settings": "Settings",
};

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { activeKb, healthState } = useApp();
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closeNav = useCallback(() => setNavOpen(false), []);

  useHotkey({ key: "k", meta: true }, openPalette);
  useHotkey({ key: "p", meta: true, shift: true }, openPalette);

  // The mobile drawer is a dialog: trapped focus, Escape to dismiss, no
  // scrolling behind it.
  useFocusTrap(drawerRef, navOpen, closeNav);
  useScrollLock(navOpen);

  // Route changes close the drawer, so back/forward never strands it open.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  // The drawer only exists below `lg`, where Tailwind's `lg:hidden` stops
  // rendering it. Growing past that breakpoint would otherwise leave it open in
  // state but invisible — a dialog nobody can see, still holding the scroll
  // lock and the focus trap. Close it when it stops being a drawer.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const close = () => {
      if (query.matches) setNavOpen(false);
    };
    close();
    query.addEventListener("change", close);
    return () => query.removeEventListener("change", close);
  }, []);

  const pageTitle = ROUTE_TITLES[location.pathname] ?? "EdgeRAG";

  return (
    <div className="relative flex h-screen overflow-hidden bg-ink">
      <KnowledgeField />
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-palette focus:rounded focus:border focus:border-line-strong focus:bg-elevated focus:px-3 focus:py-2 focus:text-[13px] focus:text-fg"
      >
        Skip to content
      </a>

      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {navOpen && (
        <div className="fixed inset-0 z-drawer flex lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in"
            style={{ background: "rgb(var(--overlay) / var(--overlay-alpha))" }}
            onClick={closeNav}
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            tabIndex={-1}
            className="relative animate-fade-in"
          >
            <Sidebar onClose={closeNav} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
          <IconButton icon="menu" label="Open navigation" className="lg:hidden" onClick={() => setNavOpen(true)} />

          {/* Where am I, and in which knowledge base? */}
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <span className="truncate text-[13px] font-medium text-fg">{pageTitle}</span>
            {activeKb && (
              <>
                <Icon name="chevronRight" size={12} className="text-faint" />
                <span className="truncate text-[13px] text-muted">{activeKb.name}</span>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={openPalette}
              aria-label="Open the command palette"
              className={cx(
                "flex h-8 items-center gap-2 rounded border border-line bg-ink px-2.5 text-left text-[13px] text-faint",
                "transition-colors duration-150 hover:border-line-strong hover:text-muted sm:w-56",
              )}
            >
              <Icon name="search" size={14} />
              <span className="hidden flex-1 sm:block">Search commands</span>
              <Kbd>⌘K</Kbd>
            </button>

            <span className="hidden items-center gap-1.5 rounded border border-line px-2 py-1 md:inline-flex">
              <StatusDot
                state={healthState === "loading" ? "busy" : healthState}
                label={`System status: ${healthState}`}
              />
              <span className="text-2xs text-muted">{healthState === "loading" ? "checking" : healthState}</span>
            </span>
          </div>
        </header>

        <main id="workspace" className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/** Shown while a lazily-loaded page's chunk is still arriving. Shaped like a
 *  page header plus content so the layout does not jump. */
function PageFallback() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="border-b border-line px-5 py-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-3 w-72" />
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
    </div>
  );
}
