/** EdgeRAG primitives.
 *
 *  Borders carry hierarchy; shadows are reserved for surfaces that genuinely
 *  float. Every interactive element is a real button or input, reachable by
 *  keyboard, with one consistent focus ring defined in `index.css`.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "./Icon";
import { cx } from "./cx";

export { cx };
export { Icon, fileIcon, type IconName } from "./Icon";

/* ============================================================ focus helpers */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Traps Tab inside `ref` while `active`, and restores focus on close.
 *  Used by every dialog, drawer and popover in the app. */
export function useFocusTrap(ref: React.RefObject<HTMLElement>, active: boolean, onEscape?: () => void) {
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    restoreTo.current = document.activeElement as HTMLElement | null;

    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    // Move focus inside on open. A form dialog should put the caret in its
    // first field rather than on the close button that happens to come first
    // in the DOM; anything else takes the first focusable.
    requestAnimationFrame(() => {
      const items = focusables();
      const firstField = items.find(
        (item) =>
          (item instanceof HTMLInputElement && item.type !== "hidden") ||
          item instanceof HTMLTextAreaElement ||
          item instanceof HTMLSelectElement,
      );
      const target = firstField ?? items[0];
      if (target) target.focus();
      else node?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscape?.();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !node?.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      restoreTo.current?.focus?.();
    };
  }, [active, ref, onEscape]);
}

/** Locks body scroll while a dialog or drawer is open.
 *
 *  Reference-counted on purpose. Overlays legitimately nest — the command
 *  palette can open over a dialog — and a lock that simply saved and restored
 *  `body.style.overflow` would have the inner lock record "hidden" as the value
 *  to restore, stranding the page scroll-locked after everything closed. Only
 *  the outermost lock touches the style, and it restores what was there before
 *  any overlay opened.
 */
let scrollLockCount = 0;
let scrollLockPrevious = "";

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (scrollLockCount === 0) {
      scrollLockPrevious = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    scrollLockCount += 1;
    return () => {
      scrollLockCount -= 1;
      if (scrollLockCount === 0) {
        document.body.style.overflow = scrollLockPrevious;
      }
    };
  }, [active]);
}

/* ---------------------------------------------------------------- Button */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
};

const BUTTON_SIZES = {
  sm: "h-7 gap-1.5 px-2.5 text-2xs",
  md: "h-8 gap-1.5 px-3 text-[13px]",
  lg: "h-10 gap-2 px-4 text-[14px]",
};

const BUTTON_VARIANTS = {
  primary: "bg-fg text-ink hover:bg-fg/90 active:bg-fg/80 shadow-sm",
  secondary: "border border-line bg-raised text-fg hover:border-line-strong hover:bg-hover active:bg-raised",
  ghost: "text-muted hover:bg-raised hover:text-fg active:bg-hover",
  subtle: "bg-raised text-fg hover:bg-hover",
  danger: "border border-danger/40 text-danger hover:bg-danger/10 active:bg-danger/15",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  iconRight,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        "press inline-flex items-center justify-center rounded font-medium whitespace-nowrap",
        "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-edge",
        "disabled:pointer-events-none disabled:opacity-45",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : icon ? <Icon name={icon} size={size === "lg" ? 16 : 14} /> : null}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={size === "lg" ? 16 : 14} />}
    </button>
  );
}

/** A square button whose icon is its only content — always needs a label. */
export function IconButton({
  icon,
  label,
  size = "md",
  variant = "ghost",
  className,
  ...rest
}: Omit<ButtonProps, "children" | "icon" | "iconRight"> & { icon: IconName; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        "press inline-flex items-center justify-center rounded transition-colors duration-150 ease-edge",
        "disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-8 w-8",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size === "sm" ? 14 : 16} />
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Copies text and confirms it did — feedback the user can actually see. */
export function CopyButton({ value, label = "Copy", size = "sm" }: { value: string; label?: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size={size}
      variant="ghost"
      icon={copied ? "check" : "copy"}
      className={cx(copied && "text-ok")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard permission denied — nothing useful to say */
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/* ----------------------------------------------------------------- Input */

const CONTROL_BASE =
  "control w-full rounded border bg-ink text-fg placeholder:text-faint transition-colors duration-150 " +
  "border-line hover:border-line-strong focus:border-accent focus:outline-none";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { icon?: IconName; invalid?: boolean }
>(function Input({ className, icon, invalid, ...rest }, ref) {
  const field = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(
        CONTROL_BASE,
        "h-8 px-2.5 text-[13px]",
        icon && "pl-8",
        invalid && "border-danger focus:border-danger",
        className,
      )}
      {...rest}
    />
  );
  if (!icon) return field;
  return (
    <span className="relative block">
      <Icon name={icon} size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
      {field}
    </span>
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(
        CONTROL_BASE,
        "resize-none px-2.5 py-2 text-[13px] leading-relaxed",
        invalid && "border-danger focus:border-danger",
        className,
      )}
      {...rest}
    />
  );
});

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select
        className={cx(CONTROL_BASE, "h-8 appearance-none py-0 pl-2.5 pr-7 text-[13px]", className)}
        {...rest}
      >
        {children}
      </select>
      <Icon
        name="chevronDown"
        size={12}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
      />
    </span>
  );
}

/** Label + control + hint/error, wired together by id so the label and the
 *  message are both announced. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const generated = useId();
  const describedBy = hint || error ? `${htmlFor ?? generated}-hint` : undefined;

  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg">
        {label}
      </label>
      {htmlFor && describedBy
        ? React.isValidElement(children)
          ? React.cloneElement(children as React.ReactElement, { "aria-describedby": describedBy })
          : children
        : children}
      {error ? (
        <p id={describedBy} className="flex items-start gap-1.5 text-2xs leading-relaxed text-danger">
          <Icon name="alert" size={12} className="mt-px" />
          {error}
        </p>
      ) : hint ? (
        <p id={describedBy} className="text-2xs leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ease-edge",
        "disabled:pointer-events-none disabled:opacity-45",
        checked ? "border-accent bg-accent/25" : "border-line bg-raised hover:border-line-strong",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform duration-200 ease-edge",
          checked ? "translate-x-[18px] bg-accent" : "translate-x-0.5 bg-faint",
        )}
      />
    </button>
  );
}

/** Toggle plus its explanatory text, as one keyboard-reachable row. */
export function ToggleRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Toggle id={id} checked={checked} onChange={onChange} label={title} />
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block text-[13px] font-medium text-fg">{title}</span>
        {description && <span className="mt-0.5 block text-2xs leading-relaxed text-muted">{description}</span>}
      </label>
    </div>
  );
}

/* ----------------------------------------------------------------- Badge */

export type Tone = "neutral" | "dense" | "sparse" | "both" | "danger" | "warn" | "ok" | "accent";

const BADGE_TONES: Record<Tone, string> = {
  neutral: "border-line text-muted",
  dense: "border-dense/40 bg-dense/5 text-dense",
  sparse: "border-sparse/40 bg-sparse/5 text-sparse",
  both: "border-both/40 bg-both/5 text-both",
  ok: "border-ok/40 bg-ok/5 text-ok",
  danger: "border-danger/40 bg-danger/5 text-danger",
  warn: "border-warn/40 bg-warn/5 text-warn",
  accent: "border-accent/40 bg-accent/5 text-accent",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  icon,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  icon?: IconName;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px font-mono text-2xs",
        BADGE_TONES[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

export type DotState = "ok" | "degraded" | "unavailable" | "busy" | "idle";

/** Status is never colour alone: `label` is announced to screen readers. */
export function StatusDot({ state, label }: { state: DotState; label?: string }) {
  const colors: Record<DotState, string> = {
    ok: "bg-ok",
    degraded: "bg-warn",
    unavailable: "bg-danger",
    busy: "bg-accent animate-edge-pulse",
    idle: "bg-faint",
  };
  return (
    <>
      <span className={cx("inline-block h-1.5 w-1.5 shrink-0 rounded-full", colors[state])} aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}

/* --------------------------------------------------------------- Tooltip */

/** Hover/focus tooltip. Renders an inline-flex wrapper so it can hold block
 *  children without producing invalid markup. */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "right";
  className?: string;
}) {
  const position = {
    top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
    right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
  }[side];

  return (
    <span className={cx("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cx(
          // w-max keeps short labels on one line; the cap plus normal wrapping
          // stops a long one from running out of its own box.
          "pointer-events-none absolute z-toast w-max max-w-[16rem] whitespace-normal text-balance",
          "rounded border border-line-strong",
          "bg-elevated px-2 py-1 text-2xs text-fg opacity-0 shadow-lg transition-opacity duration-150",
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          position,
        )}
      >
        {label}
      </span>
    </span>
  );
}

/** Richer than a tooltip: a card that appears on hover *and* keyboard focus,
 *  used for citation previews. */
export function HoverCard({
  content,
  children,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("group/hc relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cx(
          "pointer-events-none absolute bottom-full left-1/2 z-toast mb-2 w-72 -translate-x-1/2",
          "floating p-2.5 text-left opacity-0 transition-opacity duration-150",
          "group-hover/hc:opacity-100 group-focus-within/hc:opacity-100",
        )}
      >
        {content}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ Tabs */

const TONE_BG: Record<string, string> = { dense: "bg-dense", sparse: "bg-sparse", both: "bg-both" };

/** Tab list with roving focus: one tab stop, arrow keys move between tabs. */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
  idPrefix,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number; tone?: "dense" | "sparse" | "both" }[];
  className?: string;
  idPrefix?: string;
}) {
  const generated = useId();
  const prefix = idPrefix ?? generated;
  const listRef = useRef<HTMLDivElement>(null);

  const move = (delta: number) => {
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + delta + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${prefix}-tab-${next.value}`)}`)?.focus();
    });
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      className={cx("flex items-center gap-px overflow-x-auto border-b border-line", className)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            id={`${prefix}-tab-${option.value}`}
            role="tab"
            aria-selected={active}
            aria-controls={`${prefix}-panel-${option.value}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cx(
              // Slightly tighter on narrow screens: four stage tabs overflowed a
              // 390px viewport by a dozen pixels, clipping a count mid-digit.
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-[13px] sm:px-3",
              "transition-[color,border-color,background-color] duration-150 ease-edge",
              active
                ? "border-fg bg-raised/60 font-medium text-fg"
                : "border-transparent text-muted hover:border-line-strong hover:text-fg",
            )}
          >
            {option.tone && <span className={cx("h-1.5 w-1.5 rounded-full", TONE_BG[option.tone])} />}
            {option.label}
            {option.count !== undefined && (
              <span className="font-mono text-2xs text-faint tnum">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Panel that pairs with `Tabs`; keeps the aria wiring in one place. */
export function TabPanel({
  value,
  idPrefix,
  className,
  children,
}: {
  value: string;
  idPrefix: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-tab-${value}`}
      tabIndex={0}
      className={cx("focus-visible:outline-none", className)}
    >
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap(ref, open, onClose);
  useScrollLock(open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-start justify-center overflow-y-auto p-4 pt-[10vh] animate-fade-in"
      style={{ background: "rgb(var(--overlay) / var(--overlay-alpha))" }}
      onMouseDown={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className={cx("floating w-full animate-pop-in", wide ? "max-w-3xl" : "max-w-md")}
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-section-title font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-[13px] leading-relaxed text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton icon="close" label="Close" size="sm" onClick={onClose} className="-mr-1 -mt-0.5" />
        </div>
        {children && <div className="max-h-[60vh] overflow-y-auto px-4 py-4">{children}</div>}
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Menu */

/** Overflow menu. Keeps secondary row actions off small screens without
 *  hiding them. */
export function Menu({
  label,
  items,
  align = "right",
}: {
  label: string;
  items: { label: string; icon?: IconName; onSelect: () => void; danger?: boolean; disabled?: boolean }[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocument = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocument);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocument);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <IconButton icon="more" label={label} size="sm" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} />
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cx(
            "floating absolute top-full z-modal mt-1 min-w-[10rem] animate-pop-in py-1",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cx(
                "press flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors",
                "disabled:pointer-events-none disabled:opacity-45",
                item.danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-raised hover:text-fg",
              )}
            >
              {item.icon && <Icon name={item.icon} size={14} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Toasts */

type Toast = {
  id: number;
  title: string;
  body?: string;
  tone: "info" | "success" | "error";
  action?: { label: string; run: () => void };
};

const ToastContext = createContext<{ push: (toast: Omit<Toast, "id">) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...toast, id }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-toast flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              "floating pointer-events-auto animate-toast-in p-3",
              toast.tone === "error" && "border-danger/50",
              toast.tone === "success" && "border-ok/50",
            )}
          >
            <div className="flex items-start gap-2.5">
              <Icon
                name={toast.tone === "error" ? "alert" : toast.tone === "success" ? "check" : "info"}
                size={14}
                className={cx(
                  "mt-0.5",
                  toast.tone === "error" ? "text-danger" : toast.tone === "success" ? "text-ok" : "text-accent",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-fg">{toast.title}</p>
                {toast.body && <p className="mt-0.5 text-2xs leading-relaxed text-muted">{toast.body}</p>}
                {toast.action && (
                  <button
                    onClick={toast.action.run}
                    className="mt-1.5 text-2xs font-medium text-accent hover:underline"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
              <IconButton
                icon="close"
                label="Dismiss notification"
                size="sm"
                className="-mr-1 -mt-1 h-6 w-6"
                onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
              />
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------- Surfaces and sections */

/** The standard bordered surface. `title` turns it into a titled panel. */
export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
  as = "section",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div";
}) {
  const Component = as;
  return (
    <Component className={cx("panel surface-1 overflow-hidden", className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h2 className="text-[13px] font-semibold tracking-tight text-fg">{title}</h2>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Component>
  );
}

/* ------------------------------------------------- States and skeletons */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("shimmer rounded bg-raised", className)} aria-hidden="true" />;
}

/** Skeleton shaped like a list of rows, so the page does not jump when the
 *  real content lands. */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx("overflow-hidden rounded-lg border border-line", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 border-b border-line bg-surface px-3 py-3 last:border-b-0">
          <Skeleton className="h-4 w-4 rounded-sm" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
  compact,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  icon?: IconName;
  compact?: boolean;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 text-center", compact ? "py-10" : "py-16")}>
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-raised text-faint">
          <Icon name={icon} size={18} />
        </div>
      )}
      <p className="text-section-title font-medium text-fg">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Errors read as: what happened, why (when known), what to do next.
 *  Raw exception text is only ever shown behind the technical-details
 *  disclosure, never as the headline. */
export function ErrorState({
  error,
  onRetry,
  retryLabel = "Try again",
}: {
  error: { code: string; message: string; remediation?: string; details?: unknown } | null;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-danger/40 bg-danger/5 p-3" role="alert">
      <div className="flex items-start gap-2.5">
        <Icon name="alert" size={15} className="mt-px text-danger" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-fg">{error.message}</p>
          {error.remediation && <p className="mt-1 text-2xs leading-relaxed text-muted">{error.remediation}</p>}
          {error.details !== undefined && error.details !== null && (
            <details className="mt-2">
              <summary className="cursor-pointer text-2xs text-faint hover:text-muted">Technical details</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-ink p-2 font-mono text-2xs text-muted">
                {typeof error.details === "string" ? error.details : JSON.stringify(error.details, null, 2)}
              </pre>
            </details>
          )}
          {onRetry && (
            <Button size="sm" icon="refresh" className="mt-2.5" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Progress */

export function Progress({
  value,
  tone = "accent",
  label,
}: {
  value: number;
  tone?: "accent" | "ok";
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1 flex-1 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cx("h-full transition-[width] duration-500 ease-edge", tone === "ok" ? "bg-ok" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="metric w-9 shrink-0 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-line bg-raised px-1 font-mono text-2xs text-muted">
      {children}
    </kbd>
  );
}

/** Announces transient status to screen readers without showing anything. */
export function LiveStatus({ children }: { children: React.ReactNode }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {children}
    </span>
  );
}
