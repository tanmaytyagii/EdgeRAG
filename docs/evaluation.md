# Evaluation

Retrieval quality is measurable; opinions about it are not. EdgeRAG ships a small harness so
changes to chunking, budgets or models can be compared rather than guessed at.

## Writing cases

A case is a question plus whatever ground truth you have:

| Field | Required | Used for |
| --- | --- | --- |
| `question` | yes | The query |
| `expected_answer` | no | Token-F1 overlap |
| `expected_keywords` | no | Keyword recall in the answer |
| `expected_documents` | no | Context precision and recall |

Ten to thirty cases covering the shapes of question you actually ask beats a hundred
generated ones. Include cases your corpus **cannot** answer: abstention is a feature, and a
system that never refuses is failing silently.

## Runs

**Retrieval only** skips generation entirely — fast, deterministic, and the right mode when
tuning `top_k` values or chunk sizes. **Full** also generates and grades the answer; on CPU
budget roughly 20 seconds per case.

## Metrics

| Metric | Definition | Blind spot |
| --- | --- | --- |
| Context precision | Retrieved chunks from an expected document ÷ retrieved chunks | A right document can still be the wrong passage |
| Context recall | Expected documents present ÷ expected documents | Coarse when the answer lives in one of many |
| Keyword recall | Expected keywords present in the answer | Synonyms count as misses |
| Answer overlap | Token F1 against the reference | Punishes correct paraphrase |
| Faithfulness | Answer content words also in its own context ÷ answer content words | Lexical, so a well-grounded paraphrase scores low |
| Citation coverage | Claims with a valid citation ÷ claims | Says nothing about whether the citation is apt |
| Latency | Mean end-to-end and per stage | — |

These are deliberately lexical: cheap, deterministic, offline, and with no second model whose
own errors you would then have to evaluate. They are directional. A drop from 0.8 to 0.5
means something; 0.81 versus 0.79 does not.

If you want model-graded metrics, the `EvaluationRunner` takes the same provider interfaces as
the pipeline, so an LLM-judge metric is an additive change.

## Interpreting

- **Low context recall** → retrieval. Widen `dense_top_k` / `sparse_top_k`, or check chunk size in the Search Explorer.
- **Good recall, low precision** → reranking. Confirm one is enabled, raise `rerank_top_k`, or lower `context_top_k`.
- **Good retrieval, low faithfulness** → generation. Lower temperature, or try a stronger model.
- **Frequent abstention with good retrieval** → the confidence floor is too high for your corpus.
