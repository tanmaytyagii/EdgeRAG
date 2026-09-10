from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import httpx

from ..core.config import LLMSettings
from ..core.errors import LLMUnavailableError
from ..core.logging import get_logger

log = get_logger("providers.llm")


class OllamaLLM:
    """Ollama chat provider with real token streaming."""

    def __init__(self, settings: LLMSettings) -> None:
        self.settings = settings
        self.name = "ollama"
        self.model = settings.model
        self.base_url = settings.base_url.rstrip("/")

    def _payload(self, system: str, user: str, stream: bool) -> dict[str, Any]:
        return {
            "model": self.settings.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": stream,
            "options": {
                "temperature": self.settings.temperature,
                "num_predict": self.settings.max_tokens,
            },
        }

    def generate(self, system: str, user: str) -> str:
        try:
            with httpx.Client(timeout=self.settings.timeout_seconds) as client:
                response = client.post(f"{self.base_url}/api/chat", json=self._payload(system, user, False))
                response.raise_for_status()
                return response.json().get("message", {}).get("content", "")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise LLMUnavailableError(
                    f"Ollama does not have the model '{self.settings.model}'.",
                    remediation=f"Run `ollama pull {self.settings.model}`.",
                ) from exc
            raise LLMUnavailableError("Ollama returned an error.", details=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise LLMUnavailableError(f"Cannot reach Ollama at {self.base_url}.", details=str(exc)) from exc

    def stream(self, system: str, user: str) -> Iterator[str]:
        try:
            payload = self._payload(system, user, True)
            with (
                httpx.Client(timeout=self.settings.timeout_seconds) as client,
                client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response,
            ):
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    piece = event.get("message", {}).get("content")
                    if piece:
                        yield piece
                    if event.get("done"):
                        break
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise LLMUnavailableError(
                    f"Ollama does not have the model '{self.settings.model}'.",
                    remediation=f"Run `ollama pull {self.settings.model}`.",
                ) from exc
            raise LLMUnavailableError("Ollama returned an error.", details=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise LLMUnavailableError(f"Cannot reach Ollama at {self.base_url}.", details=str(exc)) from exc

    def list_models(self) -> list[str]:
        try:
            with httpx.Client(timeout=5) as client:
                response = client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                return sorted(m["name"] for m in response.json().get("models", []))
        except httpx.HTTPError:
            return []

    def health(self) -> dict[str, Any]:
        try:
            with httpx.Client(timeout=3) as client:
                response = client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                models = [m["name"] for m in response.json().get("models", [])]
        except httpx.HTTPError as exc:
            return {
                "provider": "ollama",
                "model": self.settings.model,
                "available": False,
                "base_url": self.base_url,
                "error": "Ollama is not reachable.",
                "remediation": "Start it with `ollama serve`.",
                "detail": str(exc),
            }
        return {
            "provider": "ollama",
            "model": self.settings.model,
            "available": True,
            "model_installed": self.settings.model in models,
            "base_url": self.base_url,
            "models": models,
            "remediation": None if self.settings.model in models else f"Run `ollama pull {self.settings.model}`.",
        }


def build_llm(settings: LLMSettings):
    return OllamaLLM(settings)
