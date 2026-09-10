/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Repository the landing page links to. Set at build time; falls back to the
   *  upstream placeholder so a fresh clone still renders. */
  readonly VITE_GITHUB_URL?: string;

  /** Backend origin for a split deployment, e.g. https://edgerag.up.railway.app
   *  Leave unset for local development and the single-process Docker image,
   *  where the API is served from the same origin. Never put a secret here —
   *  every VITE_ value is compiled into the public bundle. */
  readonly VITE_API_BASE_URL?: string;

  /** Marks a build as the public demo, so the UI can say so. Cosmetic only:
   *  the backend enforces read-only via EDGERAG_DEMO_MODE. */
  readonly VITE_DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
