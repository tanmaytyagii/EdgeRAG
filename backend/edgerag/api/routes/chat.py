from __future__ import annotations

import json
import time
from collections.abc import Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ...core.config import get_settings
from ...core.errors import EdgeRAGError
from ...core.logging import get_logger
from ...db.models import Conversation, Message
from ...db.session import db_session, session_scope
from ...schemas.api import ChatRequest, ConversationOut, MessageOut
from ..deps import apply_overrides, get_kb, pipeline_for

log = get_logger("api.chat")
router = APIRouter(prefix="/api", tags=["chat"])


def _title_from(question: str) -> str:
    text = " ".join(question.split())
    return text[:80] + ("…" if len(text) > 80 else "")


def _ensure_conversation(
    session: Session, knowledge_base_id: str, conversation_id: str | None, question: str
) -> Conversation:
    if conversation_id:
        conversation = session.get(Conversation, conversation_id)
        if conversation:
            return conversation
    conversation = Conversation(knowledge_base_id=knowledge_base_id, title=_title_from(question))
    session.add(conversation)
    session.flush()
    return conversation


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(knowledge_base_id: str | None = None, session: Session = Depends(db_session)):
    query = session.query(Conversation)
    if knowledge_base_id:
        query = query.filter(Conversation.knowledge_base_id == knowledge_base_id)
    rows = query.order_by(Conversation.updated_at.desc()).limit(100).all()
    return [
        ConversationOut(
            id=c.id,
            knowledge_base_id=c.knowledge_base_id,
            title=c.title,
            message_count=len(c.messages),
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in rows
    ]


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(conversation_id: str, session: Session = Depends(db_session)):
    from ...core.errors import NotFoundError

    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        raise NotFoundError(f"No conversation with id '{conversation_id}'.")
    return [
        MessageOut(
            id=m.id,
            role=m.role,
            content=m.content,
            citations=m.citations or [],
            trace=m.trace,
            confidence=m.confidence,
            abstained=bool(m.abstained),
            model=m.model,
            latency_ms=m.latency_ms,
            created_at=m.created_at,
        )
        for m in conversation.messages
    ]


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, session: Session = Depends(db_session)):
    conversation = session.get(Conversation, conversation_id)
    if conversation:
        session.delete(conversation)


@router.post("/chat")
def chat(body: ChatRequest, session: Session = Depends(db_session)):
    """Blocking answer. The streaming variant is /api/chat/stream."""
    kb = get_kb(session, body.knowledge_base_id)
    pipeline = pipeline_for(session, kb.id)
    overrides = apply_overrides(get_settings().retrieval, body.overrides)
    conversation = _ensure_conversation(session, kb.id, body.conversation_id, body.question)
    session.add(Message(conversation_id=conversation.id, role="user", content=body.question))

    started = time.perf_counter()
    answer = pipeline.answer(body.question, overrides=overrides)
    latency = (time.perf_counter() - started) * 1000

    payload = answer.to_dict()
    session.add(
        Message(
            conversation_id=conversation.id,
            role="assistant",
            content=answer.text,
            citations=payload["citations"],
            trace=payload["trace"],
            confidence=payload["confidence"],
            abstained=int(answer.abstained),
            model=answer.model,
            latency_ms=latency,
        )
    )
    payload["conversation_id"] = conversation.id
    return payload


@router.post("/chat/stream")
def chat_stream(body: ChatRequest, session: Session = Depends(db_session)):
    """Server-sent events: stage → confidence → candidates → tokens → done."""
    kb = get_kb(session, body.knowledge_base_id)
    pipeline = pipeline_for(session, kb.id)
    overrides = apply_overrides(get_settings().retrieval, body.overrides)
    conversation = _ensure_conversation(session, kb.id, body.conversation_id, body.question)
    conversation_id = conversation.id
    session.add(Message(conversation_id=conversation_id, role="user", content=body.question))
    # Commit — not flush — before the response starts streaming.
    #
    # This request's session lives until the streaming body is exhausted, so a
    # flush here would leave its write transaction open for the whole of
    # retrieval and generation. SQLite permits a single writer, so the second
    # session that persists the assistant message below would then block and
    # fail with "database is locked". Committing now releases the write lock
    # and makes the user message durable before generation begins.
    session.commit()

    question = body.question
    developer_mode = get_settings().developer_mode

    def events() -> Iterator[str]:
        def emit(payload: dict) -> str:
            return f"data: {json.dumps(payload)}\n\n"

        yield emit({"type": "conversation", "conversation_id": conversation_id})
        collected: list[str] = []
        started = time.perf_counter()
        try:
            for event in pipeline.stream(question, overrides=overrides):
                if event["type"] == "token":
                    collected.append(event["text"])
                if event["type"] == "done":
                    text = event.get("answer") or "".join(collected)
                    with session_scope() as inner:
                        inner.add(
                            Message(
                                conversation_id=conversation_id,
                                role="assistant",
                                content=text,
                                citations=event.get("citations", []),
                                trace=event.get("trace"),
                                abstained=int(event.get("abstained", False)),
                                model=event.get("model"),
                                latency_ms=(time.perf_counter() - started) * 1000,
                            )
                        )
                yield emit(event)
        except EdgeRAGError as exc:
            log.warning("Chat stream failed: %s", exc.message)
            yield emit({"type": "error", "error": exc.to_dict(include_details=developer_mode)})
        except Exception as exc:  # noqa: BLE001
            log.exception("Unexpected chat stream failure")
            yield emit({
                "type": "error",
                "error": {"code": "internal_error", "message": "Something went wrong while answering.",
                          **({"details": str(exc)} if developer_mode else {})},
            })

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
