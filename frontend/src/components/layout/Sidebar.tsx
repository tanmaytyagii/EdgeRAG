import { NavLink, useNavigate } from "react-router-dom";
import { useApp } from "../../lib/app-context";
import { count, relativeTime } from "../../lib/format";
import { GITHUB_REPO_URL } from "../../lib/identity";
import { Badge, Button, Icon, IconButton, Select, StatusDot, Tooltip, cx, type IconName } from "../ui";
import { Lockup } from "./Logo";

/** Navigation, grouped by what the user is trying to do rather than by which
 *  subsystem the page happens to touch. Every route here already exists. */
const NAV: { heading: string; items: { to: string; label: string; icon: IconName; end?: boolean }[] }[] = [
  {
    heading: "Workspace",
    items: [
      { to: "/app", label: "Overview", icon: "overview", end: true },
      { to: "/app/knowledge-bases", label: "Knowledge bases", icon: "library" },
      { to: "/app/documents", label: "Documents", icon: "documents" },
    ],
  },
  {
    heading: "Ask",
    items: [{ to: "/app/chat", label: "Chat", icon: "chat" }],
  },
  {
    heading: "Retrieval",
    items: [
      { to: "/app/explorer", label: "Search explorer", icon: "explorer" },
      { to: "/app/pipeline", label: "Retrieval pipeline", icon: "pipeline" },
      { to: "/app/evaluations", label: "Evaluations", icon: "evaluations" },
    ],
  },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { knowledgeBases, activeKb, setActiveKb, healthState, health, theme, toggleTheme } = useApp();
  const navigate = useNavigate();

  const llm = health?.llm;
  const statusLabel =
    healthState === "ok"
      ? `${llm?.model} ready`
      : healthState === "loading"
        ? "Checking system…"
        : healthState === "degraded"
          ? llm?.available
            ? `${llm?.model} not pulled`
            : "Local model unavailable"
          : "Backend unreachable";

  const statusDetail =
    healthState === "ok" ? "Every component is responding." : (llm?.remediation ?? llm?.error ?? statusLabel);

  return (
    <nav className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-surface" aria-label="Main">
      {/* Identity */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
        <button
          onClick={() => navigate("/")}
          className="press flex items-center gap-2 rounded px-1 py-1 text-fg transition-colors hover:bg-raised"
          aria-label="EdgeRAG home"
        >
          <Lockup />
        </button>
        {onClose && <IconButton icon="close" label="Close navigation" size="sm" className="ml-auto lg:hidden" onClick={onClose} />}
      </div>

      {/* Knowledge base context — which workspace am I in? */}
      <div className="shrink-0 border-b border-line px-3 py-3">
        <label htmlFor="kb-picker" className="mb-1.5 flex items-center gap-1.5 text-2xs font-medium text-muted">
          <Icon name="library" size={12} />
          Knowledge base
        </label>
        {knowledgeBases.length > 0 ? (
          <>
            <Select
              id="kb-picker"
              value={activeKb?.id ?? ""}
              onChange={(event) => setActiveKb(event.target.value)}
            >
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name}
                </option>
              ))}
            </Select>
            {activeKb && (
              <p className="mt-2 flex items-center gap-2 font-mono text-2xs text-faint tnum">
                <span>{count(activeKb.document_count)} docs</span>
                <span aria-hidden="true">·</span>
                <span>{count(activeKb.chunk_count)} chunks</span>
              </p>
            )}
          </>
        ) : (
          <Button size="sm" icon="plus" className="w-full" onClick={() => navigate("/app/knowledge-bases")}>
            Create the first one
          </Button>
        )}
      </div>

      {/* Sections */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((group) => (
          <div key={group.heading} className="mb-4 last:mb-0">
            <p className="px-2.5 pb-1.5 text-2xs font-medium uppercase tracking-wider text-faint">{group.heading}</p>
            <ul>
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cx(
                        "press group relative flex items-center gap-2.5 rounded px-2.5 py-1.5 text-[13px]",
                        "transition-colors duration-150 ease-edge",
                        isActive
                          ? "bg-raised font-medium text-fg"
                          : "text-muted hover:bg-raised/70 hover:text-fg",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* The active marker is a rail, echoing the pipeline motif. */}
                        <span
                          aria-hidden="true"
                          className={cx(
                            "absolute inset-y-1 left-0 w-0.5 rounded-full transition-opacity duration-150",
                            isActive ? "bg-accent opacity-100" : "opacity-0",
                          )}
                        />
                        <Icon name={item.icon} size={15} className={isActive ? "text-accent" : "text-faint group-hover:text-muted"} />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* System status and secondary actions */}
      <div className="shrink-0 border-t border-line">
        <div className="px-3 py-2.5">
          <Tooltip label={statusDetail} side="top" className="w-full">
            <span className="flex w-full items-center gap-2">
              <StatusDot state={healthState === "loading" ? "busy" : healthState} label={`System status: ${statusLabel}`} />
              <span className="truncate text-2xs text-muted">{statusLabel}</span>
            </span>
          </Tooltip>
          {activeKb?.last_indexed_at && (
            <p className="mt-1 font-mono text-2xs text-faint">indexed {relativeTime(activeKb.last_indexed_at)}</p>
          )}
        </div>

        <div className="flex items-center gap-1 border-t border-line px-2 py-2">
          <NavLink
            to="/app/settings"
            onClick={onClose}
            className={({ isActive }) =>
              cx(
                "press flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-[13px] transition-colors",
                isActive ? "bg-raised font-medium text-fg" : "text-muted hover:bg-raised hover:text-fg",
              )
            }
          >
            <Icon name="settings" size={15} className="text-faint" />
            Settings
          </NavLink>

          <Tooltip label="Open the repository on GitHub">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="EdgeRAG on GitHub"
              className="press flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-raised hover:text-fg"
            >
              <Icon name="github" size={15} />
            </a>
          </Tooltip>

          <Tooltip label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
            <button
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="press flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-raised hover:text-fg"
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
            </button>
          </Tooltip>
        </div>

        {health?.vector_store?.provider && (
          <div className="flex flex-wrap items-center gap-1 border-t border-line px-3 py-2">
            <Badge tone="both" icon="shield">
              local only
            </Badge>
          </div>
        )}
      </div>
    </nav>
  );
}
