/** EdgeRAG design tokens.
 *
 *  Colours resolve to CSS variables defined in `src/index.css`, so every value
 *  has one definition per theme and no component hard-codes a hex.
 *
 *  Semantic hues are reserved for data: dense retrieval is blue, sparse/BM25 is
 *  amber, agreement between the two is green. Nothing decorative uses them.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /* Surfaces, page-upwards */
        ink: "rgb(var(--ink) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        elevated: "rgb(var(--elevated) / <alpha-value>)",
        hover: "rgb(var(--hover) / <alpha-value>)",

        /* Lines */
        line: "rgb(var(--line) / <alpha-value>)",
        "line-strong": "rgb(var(--line-strong) / <alpha-value>)",

        /* Text */
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",

        /* Data hues */
        dense: "rgb(var(--dense) / <alpha-value>)",
        sparse: "rgb(var(--sparse) / <alpha-value>)",
        both: "rgb(var(--both) / <alpha-value>)",

        /* Status */
        accent: "rgb(var(--accent) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        ok: "rgb(var(--ok) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        /* The metadata size: small, but with letter-spacing that keeps it legible. */
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        /* Typographic scale, named by role rather than by size. */
        meta: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        body: ["0.8125rem", { lineHeight: "1.5rem" }],
        "card-title": ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "-0.005em" }],
        "section-title": ["0.9375rem", { lineHeight: "1.375rem", letterSpacing: "-0.01em" }],
        "page-title": ["1.1875rem", { lineHeight: "1.5rem", letterSpacing: "-0.02em" }],
        display: ["2.5rem", { lineHeight: "1.08", letterSpacing: "-0.032em" }],
        "display-lg": ["3.5rem", { lineHeight: "1.04", letterSpacing: "-0.035em" }],
      },
      borderRadius: { DEFAULT: "6px", sm: "4px", lg: "8px", xl: "12px" },
      maxWidth: {
        /* Reading measure. Prose never exceeds this, however wide the shell. */
        prose: "68ch",
        /* The workspace shell: wide enough that dashboards, tables and
           retrieval stages are not artificially squeezed on a large monitor. */
        workspace: "88rem",
        /* The landing shell. Caps at 1400px so a 1920px monitor stays composed
           rather than sprawling, while 1440px is used almost end to end. */
        landing: "87.5rem",
      },
      transitionTimingFunction: {
        edge: "cubic-bezier(0.2, 0.8, 0.3, 1)",
      },
      zIndex: {
        drawer: "40",
        modal: "50",
        toast: "60",
        palette: "70",
      },
    },
  },
  plugins: [],
};
