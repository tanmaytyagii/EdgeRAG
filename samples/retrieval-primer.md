# A short primer on retrieval

## Why one retriever is not enough

A dense retriever encodes a query and every chunk into the same vector space and
compares them by cosine similarity. It is good at meaning. Ask it about
"employee turnover" and it will surface a passage about "staff attrition" even
though the two share no words.

It is also, reliably, bad at exact terms. Product codes, surnames, statute
numbers, error strings and version identifiers are precisely the tokens an
embedding model has the least reason to preserve, because they carry almost no
distributional meaning. A query for "CVE-2021-44228" against a dense index will
often return passages about vulnerabilities in general and miss the one page
that names it.

A sparse retriever has the opposite profile. BM25 scores a document by how often
the query terms appear in it, adjusted for how rare those terms are across the
collection and how long the document is. It finds "CVE-2021-44228" instantly. It
has no idea that turnover and attrition are the same thing.

## Reciprocal rank fusion

The naive way to combine the two is to concatenate their result lists and remove
duplicates. This does not work well, for a reason that is easy to miss: it
throws away agreement. If both retrievers independently rank the same chunk near
the top, that chunk is far more likely to be relevant than one that only a
single retriever liked, and concatenation gives it no credit at all.

Reciprocal rank fusion gives each chunk a score of one divided by the quantity k
plus its rank, summed across every retriever that returned it. The constant k,
conventionally 60, damps the influence of the top few positions so a single
retriever cannot dominate. Because the formula uses rank rather than score, it
sidesteps the problem that cosine similarity and BM25 scores are on
incomparable scales and cannot be added or averaged directly.

## What reranking adds

Fusion produces good recall and mediocre precision. A cross-encoder reranker
fixes the second half. Where a bi-encoder embeds the query and the chunk
separately, a cross-encoder reads them together in a single forward pass and
outputs a relevance score. It is far more accurate and far too slow to run over
an entire corpus, which is why it belongs at the end of the funnel: retrieve
forty candidates cheaply, score those forty expensively, keep five.

The scores a cross-encoder emits are unbounded logits, not probabilities. A
score of 7.4 is high and a score of -1.6 is low, but the boundary between them
is model-specific and shifts with the query. Treating a raw logit as a
confidence value is a common mistake.

## Chunking

Chunk size trades recall against precision. Large chunks preserve context and
dilute the signal: the embedding of a two-thousand-character passage is an
average of everything in it, so a single relevant sentence barely moves the
vector. Small chunks sharpen the signal and lose the surrounding argument.

Overlap exists so that a fact spanning a boundary is not cut in half. An overlap
of roughly one eighth of the chunk size is a reasonable default. Eight hundred
characters with a hundred of overlap works well for prose.
