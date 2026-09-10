# Reranking

## Bi-encoder versus cross-encoder

A bi-encoder embeds the query and the document separately and compares vectors. Cheap,
precomputable, and necessarily lossy: the document was embedded without knowing the question.

A cross-encoder feeds query and document through the model *together* and outputs a relevance
score. Much more accurate, and impossible to precompute — cost is linear in candidates, at
query time.

So: bi-encoder for recall over the whole corpus, cross-encoder for precision over the shortlist.

## In EdgeRAG

Default `cross-encoder/ms-marco-MiniLM-L-6-v2`, about 80 MB. It scores the fused pool
(`rerank_top_k`, default 40) and the top `context_top_k` survive. Measured on CPU with the
prototype corpus: **0.35–0.42 s for 40 candidates**.

Scores are raw logits, roughly −10 to +10, and are **not** probabilities. This matters: they
are not comparable across models and should not be read as confidence. EdgeRAG maps them
through a logistic before blending them into its confidence estimate rather than thresholding
them directly.

## Running without one

Set `EDGERAG_RERANKER__PROVIDER=none`. Retrieval then orders by fusion score. EdgeRAG reports
this state explicitly — in the Search Explorer, in the answer trace, in Settings and in
`doctor` — because silently degrading precision is worse than the degradation itself.

Expect noticeably weaker precision, particularly on questions whose answer sits in a passage
that shares few words with the question.

## Tuning

- Raise `rerank_top_k` when the Search Explorer shows the right chunk in the fused list but below the cut. Cost grows linearly.
- Lower it when latency matters more than the tail.
- A larger reranker (`ms-marco-MiniLM-L-12-v2`) buys accuracy at roughly double the time.
