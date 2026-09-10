import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../lib/app-context";
import { GITHUB_REPO_URL } from "../../lib/identity";
import { Icon, Kbd, cx, useScrollLock, type IconName } from "../ui";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: IconName;
  run: () => void;
}

/** Command palette. An ARIA combobox over a listbox: the input keeps focus and
 *  `aria-activedescendant` moves the screen reader's cursor through the list. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { knowledgeBases, setActiveKb, toggleTheme, theme } = useApp();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useScrollLock(open);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string, label: string, icon: IconName, hint?: string): Command => ({
      id: path,
      label,
      hint,
      icon,
      group: "Go to",
      run: () => {
        navigate(path);
        onClose();
      },
    });

    return [
      go("/app", "Overview", "overview", "Index and system status"),
      go("/app/chat", "Chat", "chat", "Ask a grounded question"),
      go("/app/documents", "Documents", "documents", "Upload and index files"),
      go("/app/knowledge-bases", "Knowledge bases", "library"),
      go("/app/explorer", "Search explorer", "explorer", "Inspect retrieval stages"),
      go("/app/pipeline", "Retrieval pipeline", "pipeline"),
      go("/app/evaluations", "Evaluations", "evaluations"),
      go("/app/settings", "Settings", "settings"),
      ...knowledgeBases.map(
        (kb): Command => ({
          id: `kb-${kb.id}`,
          label: kb.name,
          hint: `${kb.document_count} documents`,
          group: "Switch knowledge base",
          icon: "library",
          run: () => {
            setActiveKb(kb.id);
            onClose();
          },
        }),
      ),
      {
        id: "theme",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        group: "Actions",
        icon: theme === "dark" ? "sun" : "moon",
        run: () => {
          toggleTheme();
          onClose();
        },
      },
      {
        id: "github",
        label: "Open the repository on GitHub",
        group: "Actions",
        icon: "github",
        run: () => {
          window.open(GITHUB_REPO_URL, "_blank", "noopener,noreferrer");
          onClose();
        },
      },
    ];
  }, [navigate, onClose, knowledgeBases, setActiveKb, toggleTheme, theme]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter(
      (command) =>
        command.label.toLowerCase().includes(needle) ||
        command.group.toLowerCase().includes(needle) ||
        command.hint?.toLowerCase().includes(needle),
    );
  }, [commands, query]);

  // Opening moves focus into the search field; closing hands it back to
  // whatever the user was on, so keyboard position is never lost.
  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    setQuery("");
    setCursor(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => restoreTo?.focus?.();
  }, [open]);

  useEffect(() => setCursor(0), [query]);

  // Keep the highlighted row in view as the cursor moves.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  if (!open) return null;

  // Group headings are rendered where the group changes, so the flat cursor
  // index still maps one-to-one onto `filtered`.
  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-palette animate-fade-in p-4 pt-[12vh]"
      style={{ background: "rgb(var(--overlay) / var(--overlay-alpha))" }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
        className="floating mx-auto w-full max-w-lg animate-pop-in overflow-hidden"
      >
        <div className="flex items-center gap-2 border-b border-line px-3.5">
          <Icon name="search" size={15} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => (c + 1) % Math.max(filtered.length, 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => (c - 1 + filtered.length) % Math.max(filtered.length, 1));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                filtered[cursor]?.run();
              }
            }}
            placeholder="Search commands and knowledge bases…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={filtered[cursor] ? `command-${cursor}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full bg-transparent text-[14px] text-fg placeholder:text-faint focus:outline-none"
          />
        </div>

        <ul ref={listRef} id="command-list" role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-muted">
              No command matches “{query.trim()}”.
            </li>
          )}
          {filtered.map((command, index) => {
            const showGroup = command.group !== lastGroup;
            lastGroup = command.group;
            return (
              <li key={command.id}>
                {showGroup && (
                  <p className="px-3.5 pb-1 pt-2.5 text-2xs font-medium uppercase tracking-wider text-faint">
                    {command.group}
                  </p>
                )}
                <button
                  id={`command-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={command.run}
                  className={cx(
                    "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors",
                    index === cursor ? "bg-raised text-fg" : "text-muted",
                  )}
                >
                  <Icon name={command.icon} size={14} className={index === cursor ? "text-accent" : "text-faint"} />
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint && <span className="shrink-0 font-mono text-2xs text-faint">{command.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-2xs text-faint">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> run
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
