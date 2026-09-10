# Security policy

## Threat model

EdgeRAG runs locally, binds to `127.0.0.1` by default, and assumes a single trusted user on
the machine. **It has no authentication.** Binding it to a public interface exposes every
document you have indexed to anyone who can reach the port. If you need remote access, put it
behind a reverse proxy that authenticates.

The realistic risks are therefore: hostile input files, path traversal through user-supplied
names, resource exhaustion, and accidental exposure of local data.

## What EdgeRAG does

**Uploads**
- Extensions are checked against an allowlist; anything else is rejected with `415`.
- Bodies stream to disk in 1 MB blocks and abort past the size limit with `413` — never buffered whole in memory.
- Filenames are sanitized; files are stored under a generated UUID, with the original name kept only as metadata.
- A SHA-256 is computed during ingestion.

**Paths**
- Every path is resolved and asserted to be inside the configured data directory. Traversal attempts (`../../etc/passwd`) are neutralised, and this is covered by tests.

**Execution**
- Files are parsed for text only. Nothing in an uploaded document is executed, and no untrusted data is deserialized (no `pickle`, no `eval`).
- Macros, embedded scripts and objects in PDFs and Word files are not evaluated.

**Network**
- The only outbound request during normal operation is to the configured model host, which defaults to `localhost`.
- No telemetry, no analytics, no crash reporting, no update checks.
- Model weights are downloaded from Hugging Face on first use, and only then.

**Errors**
- Internal details and stack traces are returned only when `EDGERAG_DEVELOPER_MODE=true`.

**Database**
- SQLAlchemy with parameterised queries throughout.

## Known dependency advisories

Checked at the time of the 0.1.0 tag. `npm audit` reports four advisories in the frontend
toolchain, all of which need a **major** version bump to clear, so none is applied here — a
breaking upgrade does not belong in a packaging change. Re-run `npm audit` yourself; the
picture will have moved.

| Package | Severity | Scope | Assessment |
| --- | --- | --- | --- |
| `vite` | high | dev only | Path traversal and `server.fs.deny` bypass in the **dev server**. Not in the production build output, and the dev server binds to localhost. Clearing it needs Vite 6/7. |
| `esbuild` | moderate | dev only | A website can send requests to the dev server. Same scope and same fix path. |
| `react-router`, `react-router-dom` | moderate | runtime | Open redirect via a backslash in `<Link>`/`useNavigate`, and constructor injection in SSR hydration. EdgeRAG renders no SSR and passes no user-controlled value to `to` or `navigate()` — every route is a literal. Clearing it needs React Router 7. |

Two practical mitigations: do not run `npm run dev` on an untrusted network, and use `npm run
build` plus `edgerag serve` for anything other than development. Upgrading both to their next
majors is tracked on the [roadmap](ROADMAP.md).

## Known limitations

- No authentication or authorisation. By design, for a local single-user tool.
- No encryption at rest. Use full-disk encryption if your documents warrant it.
- Answers come from a local model and may be wrong. Citations exist so you can check them; check them.
- CORS is permissive in development to allow the Vite dev server.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Use GitHub's private
vulnerability reporting on the repository, or the contact address in the repository metadata.

Include what you found, how to reproduce it, and the impact you think it has. Expect an
acknowledgement within a few days and an assessment shortly after. Please give us reasonable
time to ship a fix before disclosing publicly. We will credit you unless you prefer otherwise.

## Supported versions

EdgeRAG is pre-1.0. Fixes land on `main` and in the next release; older versions are not
patched.
