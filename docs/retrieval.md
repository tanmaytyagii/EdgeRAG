# Retrieval

## Why hybrid

| Query | Dense finds it | BM25 finds it |
| --- | --- | --- |
| "how do we handle staff leaving" → *attrition policy* | yes | no |
| `CVE-2021-44236` | usually not | yes |
| "§ 4.2(b)" | no | yes |
| "what does the paper claim about scaling" | yes | partially |

Neither is sufficient. Both are cheap.

## Reciprocal rank fusion

```python
score = sum(weight[r] / (rrf_k + rank[r][chunk]) for r in retrievers if chunk in rank[r])
```

Rank-based, so no score normalization is needed between arms. Tunable via
`retrieval.rrf_k`, `retrieval.dense_weight` and `retrieval.sparse_weight`.

`source` on each result records `dense`, `sparse` or `hybrid`. The UI colours these
consistently: blue for dense, amber for BM25, green when both retrievers agreed. Those three
colours are reserved for retrieval provenance and are used for nothing else in the interface.

## Budgets

| Setting | Default | Effect |
| --- | --- | --- |
| `dense_top_k` | 40 | Recall from the vector index. |
| `sparse_top_k` | 40 | Recall from BM25. Keep it comparable to dense. |
| `rerank_top_k` | 40 | Cross-encoder pairs. The main latency knob. |
| `context_top_k` | 5 | Chunks reaching the model. Raise for synthesis, lower for precision. |

Widen the early stages if the right passage never appears anywhere in the Search Explorer.
Narrow `context_top_k` if answers wander — more context is not automatically better, and a
smaller, sharper context usually improves grounding.

## Vector stores

`numpy` (default) persists `.npy` vectors plus a `.jsonl` metadata sidecar and does exact
brute-force cosine search. It is dependency-light and exact, which matters more than
sub-millisecond search at personal-corpus scale.

`chroma` uses a `PersistentClient`. Note the prototype's mistake: an in-memory Chroma client
rebuilt its whole index on every restart — 417 seconds for 3,200 chunks. Both EdgeRAG backends
persist.

## Inspecting retrieval

The Search Explorer runs retrieval **without generation** and shows dense, BM25, fused and
reranked lists separately, each candidate carrying its rank and score from every stage it
passed through, and marking which chunks would actually reach the model. It is the fastest way
to tell a retrieval problem from a generation problem.
