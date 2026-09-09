"""LLM provider abstraction. Gemini is the only real implementation; a mock
provider is used when LLM_MOCK_MODE=true or no API key is configured, so the
rest of the pipeline (context analysis, generators, guardrail) can be
demoed/tested without network access or burning free-tier quota.
"""

import asyncio
import json
import logging
import time
from abc import ABC, abstractmethod
from collections import deque
from typing import Optional

from google import genai
from google.genai import types
from google.genai.errors import APIError

from app.config import settings

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """Raised on unrecoverable LLM call failures (after retries)."""


class RateLimitExceeded(LLMError):
    """Raised when the local rate limiter rejects a call before it is even sent."""


class LLMProvider(ABC):
    @abstractmethod
    async def generate_text(self, prompt: str, response_schema: Optional[dict] = None) -> str:
        """Generate text from a prompt. If response_schema is given (a JSON-schema-like
        dict), the provider is asked to return JSON matching it, and the returned
        string is a JSON document.
        """
        raise NotImplementedError

    @abstractmethod
    async def describe_image(self, image_bytes: bytes, mime_type: str, prompt: str) -> str:
        """Return a text description of the given image, grounded by prompt."""
        raise NotImplementedError


class _SlidingWindowRateLimiter:
    """Enforces N calls per minute and N calls per day, in-process.

    Good enough for a single-worker demo; a multi-worker deployment would need
    this backed by Redis instead of in-memory deques.
    """

    def __init__(self, per_minute: int, per_day: int):
        self.per_minute = per_minute
        self.per_day = per_day
        self._minute_hits: deque[float] = deque()
        self._day_hits: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            self._evict(self._minute_hits, now, 60)
            self._evict(self._day_hits, now, 86400)

            if len(self._minute_hits) >= self.per_minute:
                wait = 60 - (now - self._minute_hits[0])
                raise RateLimitExceeded(
                    f"Gemini rate limit: {self.per_minute}/min reached, retry in {max(wait, 0):.0f}s"
                )
            if len(self._day_hits) >= self.per_day:
                raise RateLimitExceeded(f"Gemini rate limit: {self.per_day}/day reached")

            self._minute_hits.append(now)
            self._day_hits.append(now)

    @staticmethod
    def _evict(bucket: deque, now: float, window_seconds: int) -> None:
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str, *, max_retries: int = 2, timeout_seconds: float = 30.0):
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._max_retries = max_retries
        self._timeout_seconds = timeout_seconds
        self._limiter = _SlidingWindowRateLimiter(
            per_minute=settings.llm_rate_limit_per_minute,
            per_day=settings.llm_rate_limit_per_day,
        )

    async def generate_text(self, prompt: str, response_schema: Optional[dict] = None) -> str:
        config = types.GenerateContentConfig(
            response_mime_type="application/json" if response_schema else "text/plain",
            response_schema=response_schema,
            temperature=0.4,
        )
        return await self._call(prompt, config)

    async def describe_image(self, image_bytes: bytes, mime_type: str, prompt: str) -> str:
        config = types.GenerateContentConfig(response_mime_type="text/plain", temperature=0.4)
        contents = [types.Part.from_bytes(data=image_bytes, mime_type=mime_type), prompt]
        return await self._call(contents, config)

    async def _call(self, contents, config: "types.GenerateContentConfig") -> str:
        last_error: Optional[Exception] = None
        for attempt in range(self._max_retries + 1):
            await self._limiter.acquire()
            try:
                response = await asyncio.wait_for(
                    self._client.aio.models.generate_content(
                        model=self._model,
                        contents=contents,
                        config=config,
                    ),
                    timeout=self._timeout_seconds,
                )
                text = response.text
                if not text:
                    raise LLMError("Gemini returned an empty response")
                return text
            except asyncio.TimeoutError as exc:
                last_error = exc
                logger.warning("Gemini call timed out (attempt %d/%d)", attempt + 1, self._max_retries + 1)
            except APIError as exc:
                last_error = exc
                status = getattr(exc, "code", None)
                if status == 429:
                    logger.warning("Gemini rate limited by server (attempt %d/%d)", attempt + 1, self._max_retries + 1)
                elif status is not None and status < 500:
                    # Client error (bad request, invalid key, etc.) won't succeed on retry.
                    raise LLMError(f"Gemini API error {status}: {exc}") from exc
                else:
                    logger.warning("Gemini API error (attempt %d/%d): %s", attempt + 1, self._max_retries + 1, exc)

            if attempt < self._max_retries:
                await asyncio.sleep(2 ** attempt)

        raise LLMError(f"Gemini call failed after {self._max_retries + 1} attempts: {last_error}") from last_error


class MockProvider(LLMProvider):
    """Returns deterministic canned output so the pipeline runs without a live API key."""

    async def generate_text(self, prompt: str, response_schema: Optional[dict] = None) -> str:
        await asyncio.sleep(0)  # keep it a real coroutine / non-blocking
        if response_schema is not None:
            return json.dumps(_mock_json_for_schema(response_schema, prompt))
        return _mock_free_text(prompt)

    async def describe_image(self, image_bytes: bytes, mime_type: str, prompt: str) -> str:
        await asyncio.sleep(0)
        return (
            f"[Mock-mode image description — {len(image_bytes)} bytes, {mime_type}. "
            "No Gemini call was made. Set a real GOOGLE_API_KEY to get an actual description.]"
        )


def _mock_json_for_schema(schema: dict, prompt: str) -> dict:
    if "core_message" in schema.get("properties", {}):
        return {
            "core_message": "A mock summary of the source submission's main point.",
            "key_entities": ["Sample Entity", "Sample Org"],
            "detected_tone": "formal",
            "suggested_objective": "inform",
        }
    return {k: "" for k in schema.get("properties", {})}


def _mock_free_text(prompt: str) -> str:
    if "LinkedIn" in prompt or "linkedin" in prompt.lower():
        return (
            "Big news from our team. \n\n"
            "We're sharing an important update that reflects the work described in the source material. "
            "This is a mock-mode placeholder generated without calling Gemini.\n\n"
            "Follow along for more updates."
        )
    return (
        "[HEADER] Advisory (mock mode)\n"
        "[SUMMARY] This is a placeholder advisory generated without calling Gemini.\n"
        "[RECOMMENDED ACTIONS] Review the source submission and re-run generation with a live API key.\n"
        "[TECHNICAL DETAILS] None — mock mode.\n"
        "[CONTACTS] N/A"
    )


_provider: Optional[LLMProvider] = None


def get_llm_provider() -> LLMProvider:
    """Returns a process-wide singleton provider (so the rate limiter state is shared)."""
    global _provider
    if _provider is not None:
        return _provider

    if settings.llm_mock_mode or not settings.google_api_key:
        logger.info("LLM service running in MOCK mode (llm_mock_mode=%s, key set=%s)", settings.llm_mock_mode, bool(settings.google_api_key))
        _provider = MockProvider()
    else:
        _provider = GeminiProvider(api_key=settings.google_api_key, model=settings.gemini_text_model)
    return _provider
