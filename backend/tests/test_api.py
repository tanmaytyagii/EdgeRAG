import time


def wait_for_indexing(client, kb_id, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        documents = client.get(f"/api/knowledge-bases/{kb_id}/documents").json()
        if documents and all(d["status"] in ("ready", "failed") for d in documents):
            return documents
        time.sleep(0.2)
    raise AssertionError("Indexing did not finish in time.")


def make_kb(client, name):
    response = client.post("/api/knowledge-bases", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


def test_health_reports_component_state(client):
    body = client.get("/api/health").json()
    assert body["status"] in {"ok", "degraded", "unavailable"}
    assert "llm" in body["components"] and "embeddings" in body["components"]


def test_knowledge_base_crud(client):
    kb_id = make_kb(client, "CRUD")
    assert client.get(f"/api/knowledge-bases/{kb_id}").json()["name"] == "CRUD"
    assert client.post("/api/knowledge-bases", json={"name": "CRUD"}).status_code == 409
    assert client.patch(f"/api/knowledge-bases/{kb_id}", json={"description": "x"}).json()["description"] == "x"
    assert client.post(f"/api/knowledge-bases/{kb_id}/duplicate").status_code == 201
    assert client.delete(f"/api/knowledge-bases/{kb_id}").status_code == 204
    assert client.get(f"/api/knowledge-bases/{kb_id}").status_code == 404


def test_blank_name_is_rejected(client):
    assert client.post("/api/knowledge-bases", json={"name": "   "}).status_code == 422


def test_unsupported_upload_is_refused(client):
    kb_id = make_kb(client, "Uploads")
    response = client.post(
        f"/api/knowledge-bases/{kb_id}/documents",
        files={"file": ("payload.exe", b"MZ\x00", "application/octet-stream")},
    )
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "unsupported_file"


def test_search_before_indexing_is_a_clear_error(client):
    kb_id = make_kb(client, "Empty")
    response = client.post("/api/search", json={"knowledge_base_id": kb_id, "query": "anything"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "index_not_ready"


def test_upload_index_and_hybrid_search(client, samples):
    kb_id = make_kb(client, "Pipeline")
    for name in ("retrieval-primer.md", "local-inference-notes.md"):
        with (samples / name).open("rb") as handle:
            response = client.post(
                f"/api/knowledge-bases/{kb_id}/documents", files={"file": (name, handle, "text/markdown")}
            )
            assert response.status_code == 202

    documents = wait_for_indexing(client, kb_id)
    assert all(d["status"] == "ready" for d in documents), documents
    assert all(d["chunk_count"] > 0 for d in documents)

    body = client.post(
        "/api/search", json={"knowledge_base_id": kb_id, "query": "reciprocal rank fusion"}
    ).json()
    assert body["dense"] and body["fused"] and body["selected"]
    assert {s["name"] for s in body["trace"]["stages"]} >= {
        "dense_retrieval", "sparse_retrieval", "hybrid_fusion", "reranking",
    }
    # Every selected chunk must carry provenance the UI can turn into a citation.
    for candidate in body["selected"]:
        assert candidate["document_name"]
        assert candidate["chunk_id"]


def test_exact_term_query_is_found_by_the_sparse_arm(client, samples):
    kb_id = make_kb(client, "Sparse")
    with (samples / "retrieval-primer.md").open("rb") as handle:
        client.post(f"/api/knowledge-bases/{kb_id}/documents", files={"file": ("p.md", handle, "text/markdown")})
    wait_for_indexing(client, kb_id)
    body = client.post("/api/search", json={"knowledge_base_id": kb_id, "query": "CVE-2021-44228"}).json()
    assert body["sparse"], "BM25 should match the exact identifier"
    assert any(c["sparse_rank"] == 1 for c in body["selected"])


def test_document_chunks_and_file_download(client, samples):
    kb_id = make_kb(client, "Viewer")
    with (samples / "retrieval-primer.pdf").open("rb") as handle:
        document = client.post(
            f"/api/knowledge-bases/{kb_id}/documents", files={"file": ("p.pdf", handle, "application/pdf")}
        ).json()
    wait_for_indexing(client, kb_id)
    chunks = client.get(f"/api/documents/{document['id']}/chunks").json()
    assert chunks and all("char_start" in c and "page" in c for c in chunks)
    assert client.get(f"/api/documents/{document['id']}/file").headers["content-type"] == "application/pdf"


def test_delete_document_removes_it_from_both_indexes(client, samples):
    kb_id = make_kb(client, "Deletion")
    with (samples / "edgerag-faq.md").open("rb") as handle:
        document = client.post(
            f"/api/knowledge-bases/{kb_id}/documents", files={"file": ("f.md", handle, "text/markdown")}
        ).json()
    wait_for_indexing(client, kb_id)
    assert client.post("/api/search", json={"knowledge_base_id": kb_id, "query": "abstain"}).status_code == 200
    assert client.delete(f"/api/documents/{document['id']}").status_code == 204
    assert client.post("/api/search", json={"knowledge_base_id": kb_id, "query": "abstain"}).status_code == 409


def test_retrieval_overrides_change_the_candidate_budget(client, samples):
    kb_id = make_kb(client, "Overrides")
    with (samples / "retrieval-primer.md").open("rb") as handle:
        client.post(f"/api/knowledge-bases/{kb_id}/documents", files={"file": ("p.md", handle, "text/markdown")})
    wait_for_indexing(client, kb_id)
    body = client.post(
        "/api/search",
        json={"knowledge_base_id": kb_id, "query": "chunking", "overrides": {"context_top_k": 2, "dense_top_k": 3}},
    ).json()
    assert len(body["selected"]) <= 2
    assert len(body["dense"]) <= 3


def test_overview_reports_real_counts(client, samples):
    body = client.get("/api/overview").json()
    assert body["counts"]["knowledge_bases"] >= 1
    assert set(body["stack"]) == {"embedding_model", "llm_model", "vector_store", "retrieval"}
    assert "activity" in body


def test_settings_roundtrip(client):
    before = client.get("/api/settings").json()["retrieval"]["context_top_k"]
    patched = client.patch("/api/settings", json={"retrieval": {"context_top_k": before + 1}}).json()
    assert patched["settings"]["retrieval"]["context_top_k"] == before + 1
    assert patched["reindex_required"] is False
    assert client.patch("/api/settings", json={"chunking": {"chunk_size": 900}}).json()["reindex_required"] is True
    client.patch("/api/settings", json={"retrieval": {"context_top_k": before}, "chunking": {"chunk_size": 800}})


def test_chat_stream_commits_the_user_message_before_streaming(client):
    """Regression: the streaming route must not hold a write transaction open.

    The request session outlives the route body — FastAPI tears it down only
    once the SSE body is exhausted — so flushing the user message here used to
    leave a SQLite write lock held for the whole of retrieval and generation.
    The second session that persists the assistant message then failed with
    "database is locked", and the `done` event was never emitted.

    The route is called directly so its body runs while the response generator
    stays unconsumed: exactly the window the lock used to span. A separate
    session can only see the user message if the route already committed.
    """
    from edgerag.api.routes.chat import chat_stream
    from edgerag.db.models import Message
    from edgerag.db.session import session_scope
    from edgerag.schemas.api import ChatRequest

    kb_id = make_kb(client, "StreamTransaction")
    question = "is the user message committed before streaming?"

    with session_scope() as request_session:
        response = chat_stream(
            ChatRequest(knowledge_base_id=kb_id, question=question), session=request_session
        )
        assert response.media_type == "text/event-stream"

        # Nothing of the body has been generated yet. A different session gets
        # its own connection, so it sees committed rows only.
        with session_scope() as observer:
            persisted = observer.query(Message).filter(Message.content == question).all()

        assert len(persisted) == 1, "the user message must be committed before the body streams"
        assert persisted[0].role == "user"

        # And the write lock must be free: another session has to be able to
        # write while the streaming response is still open, which is what the
        # assistant-message insert does at the end of the stream.
        with session_scope() as writer:
            writer.add(
                Message(conversation_id=persisted[0].conversation_id, role="assistant", content="probe")
            )

    with session_scope() as after:
        roles = [
            m.role
            for m in after.query(Message)
            .filter(Message.conversation_id == persisted[0].conversation_id)
            .order_by(Message.created_at)
            .all()
        ]
    assert roles == ["user", "assistant"]
