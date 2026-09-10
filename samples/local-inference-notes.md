# Notes on local inference

## Memory budgets

A model's memory footprint at inference is roughly its parameter count times the
bytes per parameter, plus the key-value cache for the context window, plus
whatever the runtime allocates for activations.

A 1.5-billion-parameter model at 4-bit quantization needs about 0.9 GB for
weights. The same model at 16-bit needs about 3 GB. A 7-billion-parameter model
at 4-bit needs about 4 GB. On a machine with 16 GB of system memory and no
discrete GPU, a 7B model in 4-bit is comfortable and a 13B model is not.

The embedding model is a rounding error by comparison. all-MiniLM-L6-v2 has 22
million parameters and occupies about 90 MB on disk. The cross-encoder reranker
ms-marco-MiniLM-L-6-v2 is a similar size.

## Where the time goes

On CPU, in a typical local pipeline, the cost is distributed very unevenly.
Indexing dominates the first run and generation dominates every run after it.

Embedding a six-hundred-page book once takes several minutes. Every query
afterwards embeds a single sentence, which takes a few milliseconds. This
asymmetry is the entire argument for persisting the vector index to disk: an
in-memory store re-pays the multi-minute cost on every process restart, for no
benefit.

BM25 index construction is fast, on the order of a second for a few thousand
chunks, because it is a term-frequency count and not a neural forward pass.
Querying it is faster still.

Reranking forty candidates with a small cross-encoder takes roughly 0.3 to 0.5
seconds on a modern CPU. Generating a few hundred tokens with a 1.5B model takes
15 to 30 seconds. Generation is the bottleneck, by an order of magnitude, and it
is the only stage where a GPU changes the experience qualitatively.

## Quantization

Quantization reduces the precision of a model's weights. Q4_K_M, the most common
4-bit format, keeps some tensors at higher precision where accuracy is most
sensitive. Quality loss relative to 16-bit is small for most tasks and becomes
noticeable on multi-step reasoning.

For retrieval-augmented generation specifically, quantization is more forgiving
than it is for open-ended generation, because the model is summarizing supplied
text rather than recalling facts from its own weights.

## Reasoning models

Models in the DeepSeek-R1 family emit a chain of thought wrapped in <think>
tags before their actual answer. This text is not part of the response and must
be stripped before display. Failing to strip it produces the characteristic
failure where a user reads the model's internal deliberation, including its
false starts, as though it were the answer.
