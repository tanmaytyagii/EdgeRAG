"""Prompt construction.

The prototype hardcoded a "professional Project Management Assistant" persona,
which locks the system to one corpus. The prompt here is domain-neutral and
states the grounding contract explicitly.
"""
from __future__ import annotations

SYSTEM_PROMPT = """\
You answer questions using only the numbered excerpts supplied under CONTEXT.

Rules:
1. Use only the context. Do not add facts from your own knowledge.
2. Cite every claim with the bracketed number of the excerpt supporting it, like [1] or [2][3].
3. If the context does not answer the question, reply exactly: INSUFFICIENT_EVIDENCE
4. Separate what the excerpts state directly from what you infer. Mark inference with "This suggests".
5. Be concise. Lead with the answer, then support it.
6. Use a short list only when the answer is genuinely a list.
7. Never invent an excerpt number that is not in the context."""

ANSWER_TEMPLATE = """\
CONTEXT
{context}

QUESTION
{question}

ANSWER"""


def build_prompt(question: str, context: str) -> tuple[str, str]:
    """Return (system, user) messages."""
    return SYSTEM_PROMPT, ANSWER_TEMPLATE.format(context=context, question=question.strip())
