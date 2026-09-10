/** The one icon system.
 *
 *  Every glyph in EdgeRAG comes from this file: a single 24-unit grid, 1.6
 *  stroke, round caps and joins, drawn with `currentColor`. Inline SVG rather
 *  than an icon package — the set is small, and a dependency for forty paths
 *  is not worth the bytes.
 *
 *  Icons support meaning; they never decorate. If a label already says it, the
 *  icon is omitted.
 */
import type { ReactElement } from "react";
import { cx } from "./cx";

export type IconName =
  | "overview"
  | "library"
  | "documents"
  | "chat"
  | "explorer"
  | "pipeline"
  | "evaluations"
  | "settings"
  | "github"
  | "menu"
  | "close"
  | "chevronRight"
  | "chevronDown"
  | "chevronLeft"
  | "chevronUp"
  | "search"
  | "plus"
  | "upload"
  | "download"
  | "trash"
  | "refresh"
  | "external"
  | "copy"
  | "check"
  | "alert"
  | "info"
  | "sun"
  | "moon"
  | "file"
  | "filePdf"
  | "fileText"
  | "fileDoc"
  | "arrowRight"
  | "arrowDown"
  | "more"
  | "stop"
  | "send"
  | "clock"
  | "database"
  | "cpu"
  | "drive"
  | "shield"
  | "terminal"
  | "layers"
  | "sliders"
  | "quote"
  | "target"
  | "spark"
  | "eye"
  | "command";

/* Each entry is the inner geometry of a 24×24 icon. */
const PATHS: Record<IconName, ReactElement> = {
  overview: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.5" />
      <rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  library: (
    <>
      <path d="M4 5.5v13" />
      <path d="M8 4.5v15" />
      <path d="M12.5 5.2 17 19.4" />
      <rect x="11.2" y="4.2" width="3" height="2.2" rx="0.6" transform="rotate(-17 12.7 5.3)" />
      <path d="M3 20h18" />
    </>
  ),
  documents: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 16.5h4" />
    </>
  ),
  chat: (
    <>
      <path d="M20 12.5a7.5 7.5 0 0 1-10.8 6.7L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5Z" />
      <path d="M8.5 11h7M8.5 14h4.5" />
    </>
  ),
  explorer: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.7-4.7" />
      <path d="M8 10.5h5" />
    </>
  ),
  pipeline: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <circle cx="5.5" cy="12" r="2" />
      <circle cx="18.5" cy="12" r="2" />
      <circle cx="12" cy="19.5" r="2" />
      <path d="M10.6 6 6.9 10.5M13.4 6l3.7 4.5M6.9 13.5l3.7 4M17.1 13.5l-3.7 4" />
    </>
  ),
  evaluations: (
    <>
      <path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M15 3v5h5" />
      <path d="m8.5 13.5 2.2 2.2 4.3-4.3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),
  github: (
    <path
      d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronRight: <path d="m9.5 5 7 7-7 7" />,
  chevronLeft: <path d="m14.5 5-7 7 7 7" />,
  chevronDown: <path d="m5 9.5 7 7 7-7" />,
  chevronUp: <path d="m5 14.5 7-7 7 7" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  upload: (
    <>
      <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    </>
  ),
  download: (
    <>
      <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.5h16M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.5a8 8 0 1 0-.8 4.5" />
      <path d="M20 5v5h-5" />
    </>
  ),
  external: (
    <>
      <path d="M13.5 4.5H19.5V10.5" />
      <path d="M19.5 4.5 11 13" />
      <path d="M19 14.5v4a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5h4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (
    <>
      <path d="M12 4.5 2.8 19.5h18.4Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11.5v5" />
      <circle cx="12" cy="8" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z" />,
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  fileText: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M8.5 12.5h7M8.5 16h5" />
    </>
  ),
  filePdf: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8.5 17.5c2.2-1 3.6-3.2 4.2-5.4.3-1.2-.1-2.1-.9-2.1-.9 0-1.2 1-.9 2.4.6 2.6 2.2 4.4 4.6 4.6" />
    </>
  ),
  fileDoc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="m8.5 12 1.4 5.5L11.8 13l1.9 4.5L15.2 12" />
    </>
  ),
  arrowRight: <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  arrowDown: <path d="M12 4.5v15M6 13.5l6 6 6-6" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  send: <path d="M4.5 12 20 4.5 15.5 20l-4-6.2Zm7 1.8L20 4.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M19.5 12c0 1.7-3.4 3-7.5 3s-7.5-1.3-7.5-3" />
    </>
  ),
  cpu: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M10 1.5v2.5M14 1.5v2.5M10 20v2.5M14 20v2.5M1.5 10H4M1.5 14H4M20 10h2.5M20 14h2.5" />
    </>
  ),
  drive: (
    <>
      <rect x="3" y="5" width="18" height="6" rx="2" />
      <rect x="3" y="13" width="18" height="6" rx="2" />
      <path d="M7 8h.01M7 16h.01" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.8v5.4c0 4.2 2.8 7.9 7 9.3 4.2-1.4 7-5.1 7-9.3V5.8Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7.5 9.5 3 2.5-3 2.5M13 15h4" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5Z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
    </>
  ),
  quote: (
    <>
      <path d="M9.5 6.5C7 7.6 5.5 9.9 5.5 12.7v4.8h5v-5.3h-2.7c.1-1.7.9-3 2.4-3.9Z" />
      <path d="M18 6.5c-2.5 1.1-4 3.4-4 6.2v4.8h5v-5.3h-2.7c.1-1.7.9-3 2.4-3.9Z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  spark: <path d="m12 3 1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9Z" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  command: (
    <path d="M8.5 4.5a2 2 0 1 0 2 2v11a2 2 0 1 0 2-2h-11a2 2 0 1 0 2 2v-11a2 2 0 1 0-2 2h11" />
  ),
};

export function Icon({
  name,
  size = 16,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** Supply only when the icon is the sole carrier of meaning. */
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}

/** Picks the right document glyph from a filename. */
export function fileIcon(filename: string): IconName {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "filePdf";
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "fileDoc";
  if (lower.endsWith(".md") || lower.endsWith(".txt")) return "fileText";
  return "file";
}
