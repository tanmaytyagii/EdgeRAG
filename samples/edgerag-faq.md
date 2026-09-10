# EdgeRAG frequently asked questions

## Does EdgeRAG send my documents anywhere?

No. Documents are parsed, chunked, embedded and indexed on the machine EdgeRAG
runs on. The only network traffic is to the model host configured in settings,
which defaults to Ollama on localhost. There is no analytics endpoint.

## What file types can I index?

PDF, plain text, Markdown and Word documents. PDFs are parsed with PyMuPDF,
which extracts a text layer. Scanned PDFs with no text layer will fail with a
message explaining that OCR is required first.

## Why did it refuse to answer my question?

EdgeRAG abstains when the retrieved evidence is too weak to support an answer.
The threshold combines the reranker score of the best chunk, the gap between the
best and second-best, how many chunks clear the score floor, and whether the
dense and sparse retrievers agreed. You can lower it in Settings under
Confidence.

## Can I use a different model?

Yes. Any model Ollama can serve can be selected in Settings. Embedding and
reranking models are configured separately and can be any sentence-transformers
model.

## Does changing the chunk size reindex my documents?

No. Existing indexes are left alone so a settings change cannot silently
invalidate work you have already done. Documents indexed after the change use
the new settings. Re-index explicitly from the Documents page to apply the new
configuration to old files.
