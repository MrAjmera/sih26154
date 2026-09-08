from app.services.context_analyzer import ContextAnalysis
from app.services.llm_service import LLMProvider

_PROMPT_TEMPLATE = """You are drafting a LinkedIn post for a public, professional audience, based on an internal source submission. Use only facts present in the core message below — do not invent names, numbers, or claims, and do not include sensitive technical or operational details from the source text.

Core message: {core_message}
Detected tone of source: {detected_tone}

Source text (for context only — do not copy sensitive/technical details from it):
---
{source_text}
---

Write a LinkedIn post with this structure:
1. Hook — one attention-grabbing opening line.
2. Substance — 2-4 sentences expanding on the core message in a professional, engaging tone, safe for a public audience.
3. Call-to-action — a closing line inviting engagement (e.g. follow, learn more, share thoughts).

Keep it under 150 words total. Do not use section labels in the output — write it as a normal flowing post with line breaks between the hook, substance, and call-to-action. Do not include any technical specifics, internal figures, or sensitive details."""


async def generate_linkedin_post(submission_text: str, context: ContextAnalysis, llm: LLMProvider, generation_params: dict | None = None) -> str:
    prompt = _PROMPT_TEMPLATE.format(
        core_message=context.core_message,
        detected_tone=context.detected_tone,
        source_text=submission_text,
    )
    return await llm.generate_text(prompt)
