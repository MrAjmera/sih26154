"""Hallucination guardrail: flags claims in generated content that don't trace
back to the source text.

Approach (deliberately dependency-free — no spaCy/NLTK download needed on a
demo machine): pull out "checkable" spans from both source and generated text
using regex heuristics, then flag any generated span that has no fuzzy match
in the source. This catches the two things that matter most for a comms
platform: invented named entities (people/orgs/places) and invented numbers
(casualty counts, dates, amounts).
"""

import re
from dataclasses import dataclass, field

# Capitalized multi-word phrases (proper nouns / named entities), e.g. "World Health Organization"
_ENTITY_RE = re.compile(r"\b(?:[A-Z][a-zA-Z0-9&.]*(?:\s+(?:of|the|and)\s+|\s+)?){1,5}\b")
_PROPER_WORD_RE = re.compile(r"\b[A-Z][a-zA-Z0-9]{1,}\b")
# Numbers, percentages, currency, dates
_NUMERIC_RE = re.compile(
    r"\b(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:%|percent|crore|lakh|million|billion|km|kg)?\b"
)
_STOPWORDS_START = {
    "The", "A", "An", "This", "That", "These", "Those", "In", "On", "At", "For",
    "We", "It", "Our", "Their", "His", "Her", "They", "You", "I",
}


@dataclass
class UngroundedFlag:
    claim: str
    reason: str


@dataclass
class GroundingResult:
    pass_rate: float
    flags: list[UngroundedFlag] = field(default_factory=list)
    checked_count: int = 0
    grounded_count: int = 0


def extract_entities(text: str, max_entities: int = 25) -> set[str]:
    """Pull out proper-noun phrases and standalone capitalized words as a normalized set."""
    entities: set[str] = set()

    for match in _ENTITY_RE.finditer(text):
        phrase = match.group().strip()
        words = phrase.split()
        if not words:
            continue
        # drop leading stopword-only fragments and single lowercase-start artifacts
        if words[0] in _STOPWORDS_START and len(words) == 1:
            continue
        if len(phrase) < 3:
            continue
        entities.add(phrase.lower())

    for match in _PROPER_WORD_RE.finditer(text):
        word = match.group()
        if word not in _STOPWORDS_START and len(word) > 2:
            entities.add(word.lower())

    return set(list(entities)[:max_entities]) if max_entities else entities


def extract_numeric_claims(text: str) -> set[str]:
    return {m.group().strip() for m in _NUMERIC_RE.finditer(text) if m.group().strip()}


def _fuzzy_contains(needle: str, haystack: set[str]) -> bool:
    if needle in haystack:
        return True
    needle_tokens = set(needle.split())
    for hay in haystack:
        hay_tokens = set(hay.split())
        if needle_tokens and needle_tokens.issubset(hay_tokens):
            return True
        if hay_tokens and hay_tokens.issubset(needle_tokens):
            return True
    return False


def check_grounding(source_text: str, generated_text: str) -> GroundingResult:
    """Compare entities/numbers in generated_text against source_text.

    Returns a pass_rate in [0, 1] and a list of ungrounded-claim flags to
    surface to the human approver.
    """
    source_entities = extract_entities(source_text, max_entities=None)
    source_numbers = extract_numeric_claims(source_text)

    gen_entities = extract_entities(generated_text, max_entities=None)
    gen_numbers = extract_numeric_claims(generated_text)

    flags: list[UngroundedFlag] = []
    checked = 0
    grounded = 0

    for entity in gen_entities:
        checked += 1
        is_grounded = _fuzzy_contains(entity, source_entities)
        # only flag entities that look like a real claim (2+ words, i.e. a name/org/place),
        # to avoid noisy single-word false positives (e.g. generic capitalized nouns)
        if is_grounded or len(entity.split()) < 2:
            grounded += 1
        else:
            flags.append(
                UngroundedFlag(
                    claim=entity.title(),
                    reason="Entity does not appear in, or trace back to, the source content.",
                )
            )

    for number in gen_numbers:
        checked += 1
        if _fuzzy_contains(number, source_numbers) or number in source_text:
            grounded += 1
        else:
            flags.append(
                UngroundedFlag(
                    claim=number,
                    reason="Numeric/date claim not found anywhere in the source content.",
                )
            )

    pass_rate = 1.0 if checked == 0 else round(grounded / checked, 4)
    return GroundingResult(pass_rate=pass_rate, flags=flags, checked_count=checked, grounded_count=grounded)
