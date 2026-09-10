# Sample documents

These files exist so `edgerag demo` and the screenshots in the README have
something real to index. They are original text written for this repository and
released under CC0 1.0 (public domain dedication) — copy, modify and
redistribute them freely.

**Nothing copyrighted is committed here.** The research prototype EdgeRAG grew
out of was built against a commercial project-management textbook. That file is
not in this repository and never will be. To reproduce those results, supply
your own copy at ingest time:

```bash
edgerag ingest ./my-documents --kb "Research"
```

| File | What it covers | Why it is here |
|---|---|---|
| `retrieval-primer.md` | Dense vs. sparse retrieval, fusion, reranking | Exercises the hybrid path: some questions are semantic, some are exact-term |
| `local-inference-notes.md` | Running quantized models on CPU, memory budgets | Contains specific numbers, so citations are checkable |
| `edgerag-faq.md` | Short question/answer pairs | Deliberately contains gaps, so you can watch the system abstain |
