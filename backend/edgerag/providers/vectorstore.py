"""Vector stores.

`numpy` is the default because it has no dependency beyond numpy, persists to
disk, and is exact rather than approximate -- at the scale a local knowledge base
reaches (tens of thousands of chunks) a brute-force scan of a normalized matrix
is a few milliseconds and avoids an entire class of index-drift bugs.

`chroma` is available for users who already have it or want its tooling.
"""
from __future__ import annotations

import contextlib
import json
import threading
from pathlib import Path
from typing import Any

import numpy as np

from ..core.config import VectorStoreSettings
from ..core.errors import ProviderUnavailableError
from ..core.logging import get_logger

log = get_logger("providers.vectorstore")


class NumpyVectorStore:
    name = "numpy"

    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._cache: dict[str, tuple[np.ndarray, list[str], list[dict[str, Any]]]] = {}

    def _paths(self, collection: str) -> tuple[Path, Path]:
        safe = "".join(ch for ch in collection if ch.isalnum() or ch in "-_")
        return self.root / f"{safe}.npy", self.root / f"{safe}.jsonl"

    def _load(self, collection: str):
        if collection in self._cache:
            return self._cache[collection]
        vec_path, meta_path = self._paths(collection)
        if vec_path.exists() and meta_path.exists():
            vectors = np.load(vec_path)
            ids: list[str] = []
            payloads: list[dict[str, Any]] = []
            with meta_path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    record = json.loads(line)
                    ids.append(record["id"])
                    payloads.append(record["payload"])
        else:
            vectors = np.zeros((0, 0), dtype=np.float32)
            ids, payloads = [], []
        self._cache[collection] = (vectors, ids, payloads)
        return self._cache[collection]

    def _persist(self, collection: str) -> None:
        vectors, ids, payloads = self._cache[collection]
        vec_path, meta_path = self._paths(collection)
        np.save(vec_path, vectors)
        with meta_path.open("w", encoding="utf-8") as handle:
            for identifier, payload in zip(ids, payloads, strict=True):
                handle.write(json.dumps({"id": identifier, "payload": payload}) + "\n")

    def upsert(self, collection, ids, vectors, payloads) -> None:
        if not ids:
            return
        with self._lock:
            existing_vectors, existing_ids, existing_payloads = self._load(collection)
            incoming = np.asarray(vectors, dtype=np.float32)
            norms = np.linalg.norm(incoming, axis=1, keepdims=True)
            incoming = incoming / np.where(norms == 0, 1, norms)

            index = {identifier: position for position, identifier in enumerate(existing_ids)}
            fresh_vectors, fresh_ids, fresh_payloads = [], [], []
            for identifier, vector, payload in zip(ids, incoming, payloads, strict=True):
                if identifier in index:
                    existing_vectors[index[identifier]] = vector
                    existing_payloads[index[identifier]] = payload
                else:
                    fresh_vectors.append(vector)
                    fresh_ids.append(identifier)
                    fresh_payloads.append(payload)

            if fresh_vectors:
                block = np.vstack(fresh_vectors)
                existing_vectors = block if existing_vectors.size == 0 else np.vstack([existing_vectors, block])
                existing_ids = existing_ids + fresh_ids
                existing_payloads = existing_payloads + fresh_payloads

            self._cache[collection] = (existing_vectors, existing_ids, existing_payloads)
            self._persist(collection)

    def query(self, collection, vector, top_k):
        vectors, ids, payloads = self._load(collection)
        if vectors.size == 0:
            return []
        probe = np.asarray(vector, dtype=np.float32)
        norm = np.linalg.norm(probe) or 1.0
        similarities = vectors @ (probe / norm)
        top_k = min(top_k, len(ids))
        best = np.argpartition(-similarities, top_k - 1)[:top_k]
        best = best[np.argsort(-similarities[best])]
        return [(ids[i], float(similarities[i]), payloads[i]) for i in best]

    def delete_document(self, collection, document_id) -> int:
        with self._lock:
            vectors, ids, payloads = self._load(collection)
            keep = [i for i, payload in enumerate(payloads) if payload.get("document_id") != document_id]
            removed = len(ids) - len(keep)
            if removed:
                self._cache[collection] = (
                    vectors[keep] if vectors.size else vectors,
                    [ids[i] for i in keep],
                    [payloads[i] for i in keep],
                )
                self._persist(collection)
            return removed

    def drop(self, collection) -> None:
        with self._lock:
            for path in self._paths(collection):
                path.unlink(missing_ok=True)
            self._cache.pop(collection, None)

    def count(self, collection) -> int:
        return len(self._load(collection)[1])

    def health(self) -> dict[str, Any]:
        return {"provider": "numpy", "path": str(self.root), "collections": len(list(self.root.glob("*.npy")))}


class ChromaVectorStore:
    name = "chroma"

    def __init__(self, root: Path) -> None:
        try:
            import chromadb
        except ImportError as exc:
            raise ProviderUnavailableError(
                "chromadb is not installed.",
                remediation="pip install chromadb, or set EDGERAG_VECTOR_STORE__PROVIDER=numpy",
            ) from exc
        root.mkdir(parents=True, exist_ok=True)
        # A persistent client. The prototype used an in-memory Chroma, which meant
        # every restart re-embedded the entire corpus -- 416 s for a 607-page book.
        self._client = chromadb.PersistentClient(path=str(root))

    def _collection(self, name: str):
        return self._client.get_or_create_collection(name=name, metadata={"hnsw:space": "cosine"})

    def upsert(self, collection, ids, vectors, payloads) -> None:
        if not ids:
            return
        documents = [payload.get("text", "") for payload in payloads]
        metadatas = [{k: v for k, v in payload.items() if k != "text" and v is not None} for payload in payloads]
        self._collection(collection).upsert(ids=ids, embeddings=vectors, documents=documents, metadatas=metadatas)

    def query(self, collection, vector, top_k):
        result = self._collection(collection).query(query_embeddings=[vector], n_results=top_k)
        out = []
        for identifier, distance, document, metadata in zip(
            result["ids"][0], result["distances"][0], result["documents"][0], result["metadatas"][0], strict=True
        ):
            payload = dict(metadata or {})
            payload["text"] = document
            out.append((identifier, 1.0 - float(distance), payload))
        return out

    def delete_document(self, collection, document_id) -> int:
        col = self._collection(collection)
        before = col.count()
        col.delete(where={"document_id": document_id})
        return before - col.count()

    def drop(self, collection) -> None:
        # The collection may not exist; dropping an absent one is not an error.
        with contextlib.suppress(Exception):
            self._client.delete_collection(collection)

    def count(self, collection) -> int:
        return self._collection(collection).count()

    def health(self) -> dict[str, Any]:
        return {"provider": "chroma", "collections": len(self._client.list_collections())}


def build_vector_store(settings: VectorStoreSettings, root: Path):
    if settings.provider == "chroma":
        return ChromaVectorStore(root / "chroma")
    return NumpyVectorStore(root / "numpy")
