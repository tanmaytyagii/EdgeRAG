from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...core.errors import NotFoundError
from ...db.models import EvalCase, EvalRun
from ...db.session import db_session
from ...evaluation.runner import run_in_background
from ...schemas.api import EvalCaseIn, EvalCaseOut, EvalRunRequest
from ..deps import get_kb

router = APIRouter(prefix="/api/evaluation", tags=["evaluation"])


@router.get("/cases", response_model=list[EvalCaseOut])
def list_cases(knowledge_base_id: str, session: Session = Depends(db_session)):
    get_kb(session, knowledge_base_id)
    rows = (
        session.query(EvalCase)
        .filter(EvalCase.knowledge_base_id == knowledge_base_id)
        .order_by(EvalCase.created_at.desc())
        .all()
    )
    return [
        EvalCaseOut(
            id=c.id, knowledge_base_id=c.knowledge_base_id, question=c.question,
            expected_answer=c.expected_answer, expected_keywords=c.expected_keywords or [],
            expected_documents=c.expected_documents or [], created_at=c.created_at,
        )
        for c in rows
    ]


@router.post("/cases", response_model=EvalCaseOut, status_code=201)
def create_case(knowledge_base_id: str, body: EvalCaseIn, session: Session = Depends(db_session)):
    get_kb(session, knowledge_base_id)
    case = EvalCase(
        knowledge_base_id=knowledge_base_id,
        question=body.question,
        expected_answer=body.expected_answer,
        expected_keywords=body.expected_keywords,
        expected_documents=body.expected_documents,
    )
    session.add(case)
    session.flush()
    return EvalCaseOut(
        id=case.id, knowledge_base_id=case.knowledge_base_id, question=case.question,
        expected_answer=case.expected_answer, expected_keywords=case.expected_keywords,
        expected_documents=case.expected_documents, created_at=case.created_at,
    )


@router.delete("/cases/{case_id}", status_code=204)
def delete_case(case_id: str, session: Session = Depends(db_session)):
    case = session.get(EvalCase, case_id)
    if case:
        session.delete(case)


@router.post("/runs", status_code=202)
def start_run(body: EvalRunRequest, session: Session = Depends(db_session)):
    get_kb(session, body.knowledge_base_id)
    run = EvalRun(
        knowledge_base_id=body.knowledge_base_id,
        status="running",
        config={"case_ids": body.case_ids or [], "retrieval_only": body.retrieval_only},
    )
    session.add(run)
    session.flush()
    run_id = run.id
    session.commit()
    run_in_background(run_id, body.retrieval_only)
    return {"id": run_id, "status": "running"}


@router.get("/runs")
def list_runs(knowledge_base_id: str, session: Session = Depends(db_session)):
    rows = (
        session.query(EvalRun)
        .filter(EvalRun.knowledge_base_id == knowledge_base_id)
        .order_by(EvalRun.created_at.desc())
        .limit(25)
        .all()
    )
    return [
        {"id": r.id, "status": r.status, "summary": r.summary, "config": r.config, "created_at": r.created_at}
        for r in rows
    ]


@router.get("/runs/{run_id}")
def read_run(run_id: str, session: Session = Depends(db_session)):
    run = session.get(EvalRun, run_id)
    if run is None:
        raise NotFoundError(f"No evaluation run with id '{run_id}'.")
    return {
        "id": run.id, "status": run.status, "summary": run.summary,
        "results": run.results, "config": run.config, "created_at": run.created_at,
    }
