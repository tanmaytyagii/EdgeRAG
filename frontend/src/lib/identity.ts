/** EdgeRAG's identity, in one place.
 *
 *  Every GitHub link in the interface resolves from here, so the project can be
 *  forked by changing `VITE_GITHUB_URL` at build time rather than editing
 *  components. Nothing here is fetched from GitHub — the app never displays
 *  stars, forks, contributors or download counts, because it cannot verify them
 *  offline and inventing them would be a lie.
 */

export const PRODUCT_NAME = "EdgeRAG";

export const TAGLINE = "Private, local-first intelligence for your documents.";

export const GITHUB_OWNER = "tanmaytyagii";

export const GITHUB_REPO_URL =
  (import.meta.env.VITE_GITHUB_URL as string | undefined) ?? "https://github.com/tanmaytyagii/EdgeRAG";

export const GITHUB_PROFILE_URL = `https://github.com/${GITHUB_OWNER}`;

export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;

export const LICENSE = "Apache-2.0";
