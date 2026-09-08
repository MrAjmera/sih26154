from app.services.context_analyzer import ContextAnalysis
from app.services.llm_service import LLMProvider

_PROMPT_TEMPLATE = """You are drafting an official advisory for a government/organizational communications platform. Use only facts present in the source text and context below — do not invent names, numbers, dates, or claims that are not grounded in them.

Core message: {core_message}
Key entities to ground against: {key_entities}
Detected tone: {detected_tone}

Source text:
---
{source_text}
---

Write the advisory in exactly this structure, with these literal section headers on their own lines:

[HEADER]
A short, clear title for the advisory.

[SUMMARY]
2-3 sentences summarizing the situation, grounded in the core message above.

[RECOMMENDED ACTIONS]
A bullet list of concrete actions the reader should take.

[TECHNICAL DETAILS]
Any specific facts, figures, or procedural details from the source text. If none, write "None."

[CONTACTS]
Contact information if present in the source text, otherwise write "Refer to originating authority."

Keep the tone procedural and structured. Do not add sections beyond these five."""


async def generate_advisory(submission_text: str, context: ContextAnalysis, llm: LLMProvider, generation_params: dict | None = None) -> str:
    prompt = _PROMPT_TEMPLATE.format(
        core_message=context.core_message,
        key_entities=", ".join(context.key_entities) or "none extracted",
        detected_tone=context.detected_tone,
        source_text=submission_text,
    )
    return await llm.generate_text(prompt)
