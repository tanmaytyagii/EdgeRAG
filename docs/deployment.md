# Deploying EdgeRAG as a public demo

EdgeRAG is a local-first product. This document describes an *optional* second
deployment — a public demo — and nothing in it changes how EdgeRAG runs on your
machine.

```
LOCAL (the product)                    PUBLIC DEMO (a showcase)

your machine                           browser
  └─ EdgeRAG                             └─ Vercel · React build
      ├─ your documents                       └─ Railway · FastAPI + Docker
      ├─ local embeddings + reranker               ├─ bundled CC0 samples only
      └─ local Ollama                              ├─ local embeddings + reranker
          → private answer                         └─ hosted model (API key)
                                                        → grounded answer
```

The demo is **read-only**: it answers questions over the sample documents that
ship in `samples/` and refuses ingestion, deletion and settings writes. That is
deliberate — the container has no persistent disk, and the audience is anonymous.

---

## What each side needs

| | Local | Public demo |
|---|---|---|
| Documents | yours, private | bundled CC0 samples |
| Embeddings | sentence-transformers | sentence-transformers |
| Reranker | cross-encoder | cross-encoder |
| Model | Ollama on localhost | hosted, OpenAI-compatible |
| Writes | full | refused (`demo_read_only`) |
| Storage | `~/.edgerag`, persistent | container filesystem, ephemeral |

---

## 1. Backend on Railway

Railway builds the repository's `Dockerfile` and injects `$PORT`, which the
image binds automatically.

**Build arguments** — set these under *Settings → Build*:

| Argument | Value | Why |
|---|---|---|
| `EDGERAG_EXTRAS` | `[local]` | Installs torch, so embeddings and reranking are real. Without it the image can only run `hash-dev` embeddings, which have no semantic meaning and would misrepresent retrieval quality. |
| `EDGERAG_PREFETCH_MODELS` | `1` | Bakes the ~120 MB of model weights into the image. Without it every cold start re-downloads them, because the demo has no volume. |

**Environment variables** — *Settings → Variables*:

| Variable | Value | Notes |
|---|---|---|
| `EDGERAG_DEMO_MODE` | `true` | Refuses all writes. |
| `EDGERAG_DEMO_SEED_ON_STARTUP` | `true` | Indexes `samples/` on first boot. |
| `EDGERAG_CORS_ORIGINS` | `https://<your-app>.vercel.app` | Exact origin, no trailing slash. The browser blocks every call without this. |
| `EDGERAG_LLM__PROVIDER` | `openai-compatible` | Leaves Ollama for local users. |
| `EDGERAG_LLM__BASE_URL` | `https://api.groq.com/openai/v1` | Or another OpenAI-compatible base. |
| `EDGERAG_LLM__MODEL` | `llama-3.1-8b-instant` | Must exist at that provider. |
| `EDGERAG_LLM__API_KEY` | *(secret)* | Server-side only. Never returned by the API. |
| `EDGERAG_LLM__MAX_TOKENS` | `512` | Caps spend per answer. |
| `EDGERAG_LOG_LEVEL` | `INFO` | |

Leave `EDGERAG_DEVELOPER_MODE` unset. On it would attach stack traces to API
error responses.

Do **not** set `EDGERAG_PORT`; it would override Railway's `$PORT`.

**Steps**

1. Push this repository to GitHub. *(Not done for you — deliberately.)*
2. Railway → **New Project → Deploy from GitHub repo** → pick `EdgeRAG`.
3. Railway detects the `Dockerfile`. Add the two build arguments above.
4. Add the environment variables above. `EDGERAG_CORS_ORIGINS` can wait until
   step 2 of the Vercel section, once you know the frontend URL.
5. Deploy. First build is slow — torch plus baked model weights.
6. **Settings → Networking → Generate Domain**. Note the URL.
7. Check `https://<railway-domain>/api/health` returns `{"status":"ok", …}`.

**Plan.** The base image is small, but `[local]` pulls torch: expect a ~2 GB
image and ~1.5 GB RAM in use. Railway's free trial credit will not carry a
service this size for long — the **Hobby plan (~$5/month)** is the cheapest
practical option, and the RAM is the binding constraint, not the CPU.

*Cheaper alternative:* set `EDGERAG_EMBEDDING__PROVIDER=hash-dev` and
`EDGERAG_RERANKER__PROVIDER=none`, drop `EDGERAG_EXTRAS`, and the service fits a
much smaller instance — but retrieval becomes meaningless, so the demo would
misrepresent the product. Not recommended.

---

## 2. Frontend on Vercel

**Environment variables** — *Settings → Environment Variables*:

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://<your-railway-domain>` (no trailing slash, no `/api`) |
| `VITE_GITHUB_URL` | `https://github.com/tanmaytyagii/EdgeRAG` |
| `VITE_DEMO_MODE` | `true` |

Everything prefixed `VITE_` is compiled into the public bundle. **Never** put the
model API key here.

**Steps**

1. Vercel → **Add New → Project** → import the `EdgeRAG` repository.
2. Set **Root Directory** to `frontend`. Vercel then picks up
   `frontend/vercel.json`, which sets the build command, the `dist` output and
   the SPA rewrite that makes deep links like `/app/pipeline` survive a refresh.
3. Add the environment variables above.
4. Deploy, then copy the resulting `https://<app>.vercel.app` URL back into
   Railway's `EDGERAG_CORS_ORIGINS` and redeploy the backend.

A rebuild is required after changing any `VITE_` value — they are baked in at
build time, not read at runtime.

---

## 3. External accounts

| Service | Needed for | Cost |
|---|---|---|
| GitHub | source for both platforms | free |
| Railway | backend container | ~$5/month Hobby (RAM) |
| Vercel | static frontend | free Hobby tier |
| An OpenAI-compatible LLM provider | demo answers | Groq has a free tier; OpenAI/Together/OpenRouter are pay-as-you-go |

No vector database, object store or managed Postgres is required. The demo is
stateless by design: SQLite, the NumPy vectors and the BM25 index all live on the
container filesystem and are rebuilt from `samples/` on each boot.

---

## 4. Storage, and what is deliberately not persisted

The demo keeps nothing. Each deploy starts with an empty `/data`, seeds the
sample corpus, and serves it. Conversations written during a session vanish on
the next restart.

That is the correct trade-off here: the alternative is a persistent volume that
accumulates whatever anonymous visitors upload, which is both a privacy problem
and a cost problem. Writes are closed instead.

If you later want the demo to retain conversations, attach a Railway volume at
`/data` and set `EDGERAG_DEMO_SEED_ON_STARTUP=true` (seeding already no-ops when
documents exist). Note that the baked model cache lives at `/opt/hf`, outside
`/data`, so a mounted volume will not hide it.

Local installs are unaffected: `~/.edgerag` persists exactly as before.

---

## 5. Running the demo stack locally before deploying

Worth doing — it exercises the same code paths as production:

```bash
# Backend, in demo mode, on a non-default port
EDGERAG_DATA_DIR=/tmp/edgerag-demo \
EDGERAG_DEMO_MODE=true \
EDGERAG_DEMO_SEED_ON_STARTUP=true \
EDGERAG_CORS_ORIGINS=http://127.0.0.1:8088 \
PORT=8077 \
EDGERAG_LLM__PROVIDER=openai-compatible \
EDGERAG_LLM__BASE_URL=https://api.groq.com/openai/v1 \
EDGERAG_LLM__MODEL=llama-3.1-8b-instant \
EDGERAG_LLM__API_KEY=... \
edgerag serve

# Frontend, built the way Vercel builds it
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8077 VITE_DEMO_MODE=true \
  npm run build -- --outDir dist --emptyOutDir
npx serve -s dist -l 8088     # -s gives the SPA fallback vercel.json provides
```

Then confirm: the demo notice appears, the knowledge base loads across origins,
a chat answers with citations, and creating a knowledge base returns
`403 demo_read_only`.

---

## 6. Security checklist

- The model API key is read from the server environment, redacted from
  `GET /api/settings`, and stripped from `PATCH /api/settings` — it cannot be
  read or replaced through the API.
- `EDGERAG_DEMO_MODE` refuses every mutating endpoint: uploads, reindex, cancel,
  delete, knowledge-base create/update/delete/duplicate, evaluation writes and
  settings patches.
- Uploads (local mode) are already extension-allowlisted, size-capped and
  path-contained; filenames are sanitised and resolved under the storage root.
- `EDGERAG_DEVELOPER_MODE` stays off, so responses carry no stack traces.
- CORS is an explicit origin allowlist with credentials disabled.
- No secret is committed: `.env.example` ships commented placeholders only.
