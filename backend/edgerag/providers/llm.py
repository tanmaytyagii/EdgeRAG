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


class OpenAICompatibleLLM:
    """Hosted chat provider speaking the OpenAI chat-completions dialect.

    One class covers OpenAI, Groq, Together, OpenRouter and DeepSeek, because
    they share the same `/chat/completions` request shape and the same SSE
    streaming format. That is what the public demo runs on; local installs stay
    on Ollama and never construct this.

    The key is read from settings (populated from the environment) and is never
    logged, never returned by the API, and never sent to the browser.
    """

    def __init__(self, settings: LLMSettings) -> None:
        self.settings = settings
        self.name = "openai-compatible"
        self.model = settings.model
        self.base_url = settings.base_url.rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Content-Type": "application/json",
        }

    def _payload(self, system: str, user: str, stream: bool) -> dict[str, Any]:
        return {
            "model": self.settings.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": stream,
            "temperature": self.settings.temperature,
            "max_tokens": self.settings.max_tokens,
        }

    def _missing_key(self) -> LLMUnavailableError:
        return LLMUnavailableError(
            "No API key is configured for the hosted model.",
            remediation="Set EDGERAG_LLM__API_KEY in the server environment.",
        )

    def _failure(self, exc: httpx.HTTPStatusError) -> LLMUnavailableError:
        status = exc.response.status_code
        if status in (401, 403):
            return LLMUnavailableError(
                "The hosted model rejected the API key.",
                remediation="Check EDGERAG_LLM__API_KEY on the server.",
            )
        if status == 404:
            return LLMUnavailableError(
                f"The hosted provider does not serve the model '{self.settings.model}'.",
                remediation="Set EDGERAG_LLM__MODEL to a model your provider offers.",
            )
        if status == 429:
            return LLMUnavailableError(
                "The hosted model is rate limited right now.",
                remediation="Wait a moment and ask again.",
            )
        # The upstream body can echo request content; keep it out of the client.
        return LLMUnavailableError("The hosted model returned an error.", details=f"HTTP {status}")

    def generate(self, system: str, user: str) -> str:
        if not self.settings.api_key:
            raise self._missing_key()
        try:
            with httpx.Client(timeout=self.settings.timeout_seconds) as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    json=self._payload(system, user, False),
                    headers=self._headers(),
                )
                response.raise_for_status()
                choices = response.json().get("choices") or [{}]
                return choices[0].get("message", {}).get("content", "")
        except httpx.HTTPStatusError as exc:
            raise self._failure(exc) from exc
        except httpx.HTTPError as exc:
            raise LLMUnavailableError(
                f"Cannot reach the hosted model at {self.base_url}.",
                # Without an explicit remediation the class default fires and
                # tells a hosted-demo user to run `ollama serve`, which is
                # nonsense when the provider is Groq or OpenAI.
                remediation="Check the provider's status and EDGERAG_LLM__BASE_URL.",
                details=str(exc),
            ) from exc

    def stream(self, system: str, user: str) -> Iterator[str]:
        if not self.settings.api_key:
            raise self._missing_key()
        try:
            with (
                httpx.Client(timeout=self.settings.timeout_seconds) as client,
                client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    json=self._payload(system, user, True),
                    headers=self._headers(),
                ) as response,
            ):
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = event.get("choices") or []
                    if not choices:
                        continue
                    piece = choices[0].get("delta", {}).get("content")
                    if piece:
                        yield piece
        except httpx.HTTPStatusError as exc:
            raise self._failure(exc) from exc
        except httpx.HTTPError as exc:
            raise LLMUnavailableError(
                f"Cannot reach the hosted model at {self.base_url}.",
                # Without an explicit remediation the class default fires and
                # tells a hosted-demo user to run `ollama serve`, which is
                # nonsense when the provider is Groq or OpenAI.
                remediation="Check the provider's status and EDGERAG_LLM__BASE_URL.",
                details=str(exc),
            ) from exc

    def list_models(self) -> list[str]:
        """The configured model only.

        Hosted catalogues run to hundreds of entries and listing them would
        invite a demo visitor to switch models, so this reports what is actually
        in use rather than what could be.
        """
        return [self.settings.model] if self.settings.model else []

    def health(self) -> dict[str, Any]:
        if not self.settings.api_key:
            return {
                "provider": self.name,
                "model": self.settings.model,
                "available": False,
                "model_installed": False,
                "base_url": self.base_url,
                "error": "No API key is configured for the hosted model.",
                "remediation": "Set EDGERAG_LLM__API_KEY in the server environment.",
            }
        # A models probe is one cheap authenticated call; it verifies both
        # reachability and the key without spending tokens on a completion.
        try:
            with httpx.Client(timeout=5) as client:
                response = client.get(f"{self.base_url}/models", headers=self._headers())
                response.raise_for_status()
        except httpx.HTTPError as exc:
            reachable = isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code < 500
            if not reachable:
                return {
                    "provider": self.name,
                    "model": self.settings.model,
                    "available": False,
                    "model_installed": False,
                    "base_url": self.base_url,
                    "error": "The hosted model is not reachable.",
                    "remediation": "Check the provider status and EDGERAG_LLM__BASE_URL.",
                }
        return {
            "provider": self.name,
            "model": self.settings.model,
            "available": True,
            # There is nothing to pull: a hosted model is ready by definition.
            "model_installed": True,
            "base_url": self.base_url,
            "models": [self.settings.model],
            "remediation": None,
        }


def build_llm(settings: LLMSettings):
    if settings.provider == "openai-compatible":
        return OpenAICompatibleLLM(settings)
    return OllamaLLM(settings)
