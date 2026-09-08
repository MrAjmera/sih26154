"""One Gemini call that extracts the structured context every format generator
grounds against: core message, key entities, tone, and intent.
"""

import json
import logging
from dataclasses import dataclass, field

from app.services.llm_service import LLMError, LLMProvider

logger = logging.getLogger(__name__)

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "core_message": {"type": "string"},
        "key_entities": {"type": "array", "items": {"type": "string"}},
        "detected_tone": {"type": "string"},
        "suggested_objective": {"type": "string"},
    },
    "required": ["core_message", "key_entities", "detected_tone", "suggested_objective"],
}

_PROMPT_TEMPLATE = """You are analyzing a source submission for a government/organizational communications platform. Read the text below and extract its context. Do not add any information that is not present in the text.

Return:
- core_message: one or two sentences stating the single main point of the text, in your own words but without inventing new facts.
- key_entities: a list of the proper nouns, names, organizations, places, and important specific terms that appear in the text (up to 15).
- detected_tone: one word or short phrase describing the tone of the source text (e.g. "formal", "urgent", "technical", "neutral").
- suggested_objective: the most likely communication objective for content based on this text — one of: "inform", "alert", "guide", "promote", "reassure" — pick the single best fit.

Source text:
---
{source_text}
---

Respond with JSON only, matching the required schema."""


@dataclass
class ContextAnalysis:
    core_message: str
    key_entities: list[str] = field(default_factory=list)
    detected_tone: str = "neutral"
    suggested_objective: str = "inform"

    def to_dict(self) -> dict:
        return {
            "core_message": self.core_message,
            "key_entities": self.key_entities,
            "detected_tone": self.detected_tone,
            "suggested_objective": self.suggested_objective,
        }


async def analyze_context(source_text: str, llm: LLMProvider) -> ContextAnalysis:
    prompt = _PROMPT_TEMPLATE.format(source_text=source_text)

    try:
        raw = await llm.generate_text(prompt, response_schema=_RESPONSE_SCHEMA)
        data = json.loads(raw)
        return ContextAnalysis(
            core_message=data.get("core_message", "").strip(),
            key_entities=[str(e).strip() for e in data.get("key_entities", []) if str(e).strip()],
            detected_tone=data.get("detected_tone", "neutral").strip() or "neutral",
            suggested_objective=data.get("suggested_objective", "inform").strip() or "inform",
        )
    except (LLMError, json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.error("Context analysis failed, falling back to a minimal analysis: %s", exc)
        # Degrade gracefully rather than failing the whole job: generators can
        # still run grounded only against the raw source text.
        return ContextAnalysis(
            core_message=source_text[:280],
            key_entities=[],
            detected_tone="neutral",
            suggested_objective="inform",
        )
