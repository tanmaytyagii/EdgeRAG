## What this changes

<!-- A sentence or two. The diff shows the what; explain the why. -->

## Why

<!-- The problem being solved. Link the issue if there is one: Closes #123 -->

## How to verify

<!-- Exact steps a reviewer can follow. -->

## Checklist

- [ ] `make test` passes (without torch, Ollama or network access)
- [ ] `make lint` passes
- [ ] `make typecheck` passes if the frontend changed
- [ ] New behaviour has a test; a bug fix has a test that failed before it
- [ ] `docs/` updated if behaviour changed
- [ ] `CHANGELOG.md` updated under "Unreleased"
- [ ] No UI control was added that does not actually work
- [ ] No figure is displayed that is not measured or read from the database
- [ ] No third-party documents were committed

## Verified / not verified

<!-- Be specific about what you ran and what you did not. For example:
     "Tested with all-MiniLM-L6-v2 and qwen2.5:7b on macOS. Not tested on Windows or with Chroma." -->
