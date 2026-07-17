"""Shared OpenRouter client with multi-key rotation.

Env supports:
  OPENROUTER_API_KEY=key1,key2,key3   (or API_KEY)
  MODEL_NAME=openai/gpt-4o-mini       (or OPENROUTER_MODEL)

On 401 / 402 / 429 the next key is tried. Keys cycle forever.
Never log raw API keys.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Status codes that mean "try next key"
_RETRYABLE = {401, 402, 403, 429}


class OpenRouterError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _mask(key: str) -> str:
    if len(key) <= 8:
        return "***"
    return f"{key[:6]}…{key[-4:]}"


def parse_api_keys(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip() and not part.strip().startswith("your-")]


class OpenRouterClient:
    def __init__(self) -> None:
        self._index = 0

    @property
    def keys(self) -> list[str]:
        return settings.openrouter_api_keys

    @property
    def model(self) -> str:
        return settings.openrouter_model_name

    @property
    def configured(self) -> bool:
        return bool(self.keys)

    def key_count(self) -> int:
        return len(self.keys)

    def _next_key(self) -> str:
        keys = self.keys
        if not keys:
            raise OpenRouterError(
                "No OpenRouter API keys configured. Set OPENROUTER_API_KEY (or API_KEY) in .env"
            )
        key = keys[self._index % len(keys)]
        self._index = (self._index + 1) % len(keys)
        return key

    def _error_message(self, status_code: int, body: str) -> str:
        try:
            payload = json.loads(body)
            msg = payload.get("error", {}).get("message") or payload.get("message") or body
        except json.JSONDecodeError:
            msg = body[:200]

        if status_code in (401, 403):
            return "OpenRouter API key is invalid or expired"
        if status_code == 402:
            return "OpenRouter credit limit exceeded on current key"
        if status_code == 429:
            return "OpenRouter rate limit exceeded"
        if status_code == 404 and "model" in str(msg).lower():
            return f"OpenRouter model not available: {self.model}. Check MODEL_NAME or OPENROUTER_MODEL in .env"
        return f"OpenRouter API error ({status_code})"

    async def chat_completions(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int = 800,
        temperature: float = 0.2,
        timeout: float = 60.0,
    ) -> str:
        keys = self.keys
        if not keys:
            raise OpenRouterError(
                "No OpenRouter API keys configured. Set OPENROUTER_API_KEY (or API_KEY) in .env"
            )

        last_error: OpenRouterError | None = None
        attempts = len(keys)

        for attempt in range(attempts):
            key = keys[(self._index + attempt) % len(keys)]
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(
                        f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {key}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": settings.FRONTEND_URL,
                            "X-Title": "MailDesk",
                        },
                        json={
                            "model": self.model,
                            "messages": messages,
                            "max_tokens": max_tokens,
                            "temperature": temperature,
                        },
                    )

                    if response.status_code in _RETRYABLE:
                        logger.warning(
                            "OpenRouter key %s failed with %s — trying next key",
                            _mask(key),
                            response.status_code,
                        )
                        last_error = OpenRouterError(
                            self._error_message(response.status_code, response.text),
                            status_code=response.status_code,
                        )
                        continue

                    if response.status_code >= 400:
                        raise OpenRouterError(
                            self._error_message(response.status_code, response.text),
                            status_code=response.status_code,
                        )

                    data = response.json()
                    if data.get("error"):
                        err = data["error"]
                        code = err.get("code", 502)
                        status_code = int(code) if str(code).isdigit() else 502
                        if status_code in _RETRYABLE:
                            last_error = OpenRouterError(
                                self._error_message(status_code, str(err.get("message", err))),
                                status_code=status_code,
                            )
                            continue
                        raise OpenRouterError(
                            self._error_message(status_code, str(err.get("message", err))),
                            status_code=status_code,
                        )

                    # Success — advance rotation pointer past this key next time
                    self._index = (self._index + attempt + 1) % len(keys)
                    return data["choices"][0]["message"]["content"].strip()

            except OpenRouterError:
                raise
            except httpx.HTTPError as exc:
                last_error = OpenRouterError(f"Could not reach OpenRouter API: {exc}")
                continue
            except (KeyError, IndexError, TypeError) as exc:
                raise OpenRouterError("Unexpected response format from OpenRouter API") from exc

        raise last_error or OpenRouterError("All OpenRouter API keys failed")

    async def embed(
        self,
        texts: list[str],
        *,
        timeout: float = 60.0,
    ) -> list[list[float]]:
        """Return embedding vectors for each text (same order)."""
        keys = self.keys
        if not keys:
            raise OpenRouterError(
                "No OpenRouter API keys configured. Set OPENROUTER_API_KEY (or API_KEY) in .env"
            )
        cleaned = [(" ".join((t or "").split())[:8000] or " ") for t in texts]
        last_error: OpenRouterError | None = None
        attempts = len(keys)
        model = settings.EMBEDDING_MODEL

        for attempt in range(attempts):
            key = keys[(self._index + attempt) % len(keys)]
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(
                        f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/embeddings",
                        headers={
                            "Authorization": f"Bearer {key}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": settings.FRONTEND_URL,
                            "X-Title": "MailDesk",
                        },
                        json={"model": model, "input": cleaned},
                    )

                    if response.status_code in _RETRYABLE:
                        last_error = OpenRouterError(
                            self._error_message(response.status_code, response.text),
                            status_code=response.status_code,
                        )
                        continue

                    if response.status_code >= 400:
                        raise OpenRouterError(
                            self._error_message(response.status_code, response.text),
                            status_code=response.status_code,
                        )

                    data = response.json()
                    items = sorted(data.get("data") or [], key=lambda x: x.get("index", 0))
                    vectors = [item["embedding"] for item in items]
                    if len(vectors) != len(cleaned):
                        raise OpenRouterError("Unexpected embeddings response size")
                    self._index = (self._index + attempt + 1) % len(keys)
                    return vectors
            except OpenRouterError:
                raise
            except httpx.HTTPError as exc:
                last_error = OpenRouterError(f"Could not reach OpenRouter API: {exc}")
                continue
            except (KeyError, TypeError, ValueError) as exc:
                raise OpenRouterError("Unexpected embeddings response from OpenRouter") from exc

        raise last_error or OpenRouterError("All OpenRouter API keys failed for embeddings")


openrouter = OpenRouterClient()
