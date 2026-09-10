/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Repository the landing page links to. Set at build time; falls back to the
   *  upstream placeholder so a fresh clone still renders. */
  readonly VITE_GITHUB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
