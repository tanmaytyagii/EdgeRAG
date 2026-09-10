# The RAG pipeline

Six stages. Each one exists because the previous one has a specific failure mode.

## 1. Query processing

The question is normalized (whitespace, hyphenation across line breaks, soft hyphens) and
embedded **once**. The same normalization ran over documents at ingestion time, so a word
broken across a PDF line break matches the query form of it.

## 2. Dense retrieval

Cosine similarity against the vector index returns `dense_top_k` (default 40) candidates.
Strong on paraphrase, weak on rare exact tokens.

## 3. Sparse retrieval

BM25 over the same chunks returns `sparse_top_k` candidates. Strong on identifiers, section
numbers, error codes and proper nouns; blind to paraphrase.

Both arms use the same budget by default. The prototype this project came from set the sparse
arm to 5 while the dense arm used 40, which quietly made the keyword half nearly irrelevant.

## 4. Fusion

Weighted reciprocal rank fusion:

```
score(c) = Σ_r  w_r / (k + rank_r(c))
```

Ranks, not scores, so incomparable scales (cosine similarity and BM25 saturation) never need
calibrating against each other. `k` (default 60) controls how sharply top ranks dominate.

The key property is that **agreement is rewarded**. A chunk at dense rank 3 and BM25 rank 1
scores `1/63 + 1/61 = 0.0323`, beating a chunk at dense rank 1 alone (`1/61 = 0.0164`).
`tests/test_fusion.py` asserts exactly this case.

## 5. Reranking

A cross-encoder reads the query and each candidate together and scores the pair directly. It
is much more accurate than a bi-encoder and much too slow to run over a corpus, so it runs
over the fused pool only — 40 pairs, not 3,200.

Its output ordering determines the final `context_top_k` chunks. When no reranker is
configured, EdgeRAG falls back to fusion order and marks the stage as skipped everywhere it is
reported.

## 6. Confidence and generation

Before generating, EdgeRAG estimates confidence (see below) and may abstain. If it proceeds,
context is assembled with numbered source blocks carrying document name and page, the model is
called with a system prompt that forbids outside knowledge, and the answer's `[n]` markers are
validated against the blocks that were actually sent. Markers with no referent are removed
rather than displayed as broken links.

## Confidence

Four signals, blended:

| Signal | What it catches |
| --- | --- |
| Strength | The top chunk's score, mapped through a logistic so raw logits are bounded. |
| Margin | Top minus runner-up. A flat distribution means nothing stood out. |
| Support | How many chunks clear the threshold. One lucky hit is weaker than three. |
| Agreement | Whether both retrievers found the top chunks. |

If the blend falls below `confidence.min_confidence`, the pipeline returns the abstention
sentinel and the UI marks the answer as insufficient evidence, with the reason and the
per-signal values shown.

With reranking disabled, the strength and margin signals are unreliable, so the estimate
degrades toward agreement and support, and says so in its reason string rather than reporting
false precision.
