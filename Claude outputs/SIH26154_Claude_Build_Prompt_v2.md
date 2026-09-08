# Claude build prompt — GenAI Content Transformation Platform (v2)
### SIH26154 · Smart India Hackathon 2026 · NTRO · Theme: Blockchain & Cybersecurity

I want you to help me build a working prototype of a GenAI content transformation platform for Smart India Hackathon 2026 (Problem Statement SIH26154, sponsored by NTRO). I'll give you the full context below — please build this step by step with me, starting with the project scaffold, and confirm the plan before generating a large amount of code.

This is v2 of the prompt — it adds authentication, an approval workflow, content-integrity hashing, LLM-provider abstraction, upload validation, a hallucination guardrail, output confidence scoring, and audit logging on top of the original spec, because the theme is Blockchain & Cybersecurity and the sponsor is a national security agency, so a bare LLM-wrapper pipeline with no security story will lose points at judging even if the generation quality is good. It also tells you to make your own implementation decisions and keep moving rather than stopping to ask — see the last section below.

## What the app does

Operators submit source content (text, a document, an image, a video, or a free-form prompt) plus generation parameters (target audience, tone, language, detail level, communication objective, content style), and select one or more desired output formats. The system analyzes the source content and generates all selected deliverables from the same source:

- Video — script, storyboard (scene-by-scene), narration text, subtitles, visual recommendations
- LinkedIn Post — professional long-form post
- Twitter/X Post — platform-optimized tweet or thread
- Advisory — structured advisory document
- Infographic — content, layout recommendations, key messaging
- Executive Summary — concise briefing
- Presentation — slides + speaker notes

The core value proposition: one source, many correctly-formatted outputs, generated consistently and in parallel — replacing manual reformatting work currently done by different specialists.

## Target users

Government communications officers, incident-response teams, and policy staff who understand their content and audience but don't have time or specialist skill to manually rewrite the same information into five different formats.

## Architecture (6-stage pipeline)

1. **Operator dashboard** — content input + output-type multi-select + generation parameters, behind login
2. **Ingestion & normalization** — every input type (text/document/image/video/prompt) converges into one common representation: `{ text, source_type, extracted_structure, metadata }`
3. **Sensitivity classification** — before anything leaves the app, a lightweight classifier scans normalized text for classification markings, PII patterns, and a configurable sensitive-keyword list; flags or blocks the submission from reaching an external LLM provider above the configured threshold
4. **Context & intent analysis** — one LLM call producing a structured analysis: `{ core_message, key_entities, detected_tone, suggested_objective }`, which every downstream generator shares so outputs stay consistent with each other
5. **Format generation engine** — a router fans out to one specialist generator per selected format, run concurrently, each with its own prompt template and structured output shape, grounded against `core_message`/`key_entities` to reduce hallucination
6. **Output store & delivery + approval** — outputs are hashed and chained for tamper-evidence, held as `draft` until an approver reviews and promotes them to `approved`/`published`; operator can preview, download, and regenerate a single format without rerunning the whole pipeline

## Security & governance requirements (new in v2)

These are not stretch goals — build items a–e alongside the core pipeline, not after it. They're small additions to the existing data model, not a separate subsystem.

**a. LLM provider abstraction.** Wrap every model call behind an `LLMProvider` interface (`generate_text`, `generate_structured`, `embed`). Ship one implementation backed by Gemini. Add a second stub implementation (even a thin wrapper around a local Ollama model, or just a clearly-labeled `LocalLLMProvider` placeholder) so the architecture visibly supports on-prem/air-gapped deployment for sensitive content, selected by a config flag rather than hardcoded.

**b. Auth + roles.** Basic email/password auth (NextAuth is fine) with a `role` field on the user: `operator`, `approver`, `admin`. No endpoint should be reachable unauthenticated.

**c. Approval workflow.** Add `status` (`draft` / `approved` / `published`) and `approved_by`, `approved_at` to `generated_outputs`. Only `approver`/`admin` roles can transition status. This is both your governance story and your product-quality story — nothing goes out under the org's name without a human sign-off.

**d. Tamper-evidence hash chain.** On creation, store `content_hash = sha256(content + previous_hash)` on each `generated_outputs` row, where `previous_hash` is the hash of the prior row in that job (or a genesis value for the first). Expose a "verify integrity" action that recomputes the chain and confirms nothing was altered post-generation. This is the concrete, demoable nod to the "Blockchain" half of the theme — no need for a real distributed ledger.

**e. Audit log.** A simple `audit_log` table (`id, user_id, action, entity_type, entity_id, created_at`) written on every submission, generation, approval, and publish action. One sentence in your pitch ("every action is logged with actor and timestamp") closes a gap most competing teams will leave open.

**f. Upload validation.** Enforce a file-type allowlist and size cap at the ingestion API for image/video/document uploads, and reject anything outside it before it touches disk or gets sent anywhere. Note in the architecture doc that production would add AV/malware scanning on top of this — you don't need to build a scanner, but the validation layer itself should be real.

**g. Hallucination guardrail.** Every generator's output must be checked against `core_message`/`key_entities` from the context-analysis stage before it's shown to the operator — flag (don't silently drop) any named entity or claim in the generated output that doesn't trace back to the source. This is core, not stretch: an advisory that invents a detail is the single most damaging thing this tool could produce for a real agency, and it's a cheap check (entity-overlap comparison, or a second small structured LLM call) to build alongside the generators themselves.

**h. Output confidence score.** Attach a simple quality/confidence score to each `generated_outputs` row (e.g. grounding-check pass rate + basic format-compliance check) and surface it in the preview UI. This gives the approver something concrete to act on and reads as real quality control rather than a bare LLM wrapper.

Build a–h in parallel with the relevant pipeline stage, not bolted on at the end — g and h specifically belong in the same build step as the generators (step 4/5 below), not deferred.

## Style-consistency RAG (secondary feature, build after the core pipeline works)

A "Reference Library" where an operator uploads past communications (advisories, posts, etc.) over time. Before generating a given format, the system embeds the current content, retrieves the 2-3 most similar past examples of that format from the library, and includes them in the generator's prompt as style references — so outputs match the organization's own voice and structure. Seed the library with a handful of synthetic example documents (mock cybersecurity advisory, mock LinkedIn post, etc.) since this is a hackathon demo, not a production deployment with real historical data.

## Tech stack — please use exactly this

- Frontend: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui components
- Backend: FastAPI (Python 3.11+), async throughout
- Auth: NextAuth (or FastAPI equivalent) with role-based access control
- Database: PostgreSQL with the pgvector extension (one database for relational data, style-RAG embeddings, and the audit log)
- Job queue: Celery + Redis for async generation (don't block the request while multi-format generation runs)
- LLM provider: `LLMProvider` interface as described above; default implementation uses Google AI Studio / Gemini API via the `google-genai` SDK (free tier) — model `gemini-2.5-flash` for generation, `gemini-embedding-001` for the style-RAG embeddings (truncate to 768 dimensions)
- Use `response_schema` with pydantic models for structured JSON output on every generator
- Gemini accepts images/audio/video natively as input — for image, audio, and video ingestion, upload via the Files API and ask Gemini to transcribe/describe it directly. Do not add separate OCR or transcription libraries; only use local PDF/DOCX parsing (pymupdf, python-docx) for document ingestion, since those need clean structured text extraction that the model shouldn't have to do.
- The free tier is roughly 10 requests/minute and 250/day — cap concurrent generator calls with `asyncio.Semaphore(3)` rather than unlimited `asyncio.gather`, since one submission with 5+ selected formats plus the ingestion/analysis calls can otherwise exceed the per-minute limit. Cache the last successful full run so a demo has a fallback if the live quota is hit.
- Secrets via environment variables only, never committed; document rotation expectations in the architecture doc
- Containerization: Docker Compose for local dev (postgres with pgvector image, redis, backend, celery worker, frontend)

## Data model

```
users               (id, email, password_hash, role, created_at)
submissions         (id, user_id fk, source_type, raw_content_path, normalized_text,
                      sensitivity_flag, metadata jsonb, params jsonb, created_at)
jobs                (id, submission_id fk, status, requested_formats text[], created_at, completed_at)
generated_outputs   (id, job_id fk, format_type, content jsonb, content_hash, previous_hash,
                      status, approved_by fk, approved_at, confidence_score,
                      ungrounded_flags jsonb, created_at)
reference_documents (id, format_type, content, embedding vector(768), created_at)
audit_log           (id, user_id fk, action, entity_type, entity_id, created_at)
```

## API endpoints needed

```
POST   /api/auth/login                      -- authenticate, returns session/token
POST   /api/submissions                     -- upload content + params, returns submission_id (auth required)
POST   /api/submissions/{id}/generate        -- body: { formats: [...] }, enqueues job, returns job_id
GET    /api/jobs/{job_id}                    -- poll status
GET    /api/outputs/{job_id}                 -- fetch all generated outputs for a completed job
POST   /api/outputs/{output_id}/approve      -- approver/admin only: draft -> approved -> published
GET    /api/outputs/{output_id}/verify       -- recompute hash chain, confirm integrity
POST   /api/reference-library                -- upload a house-style example
GET    /api/reference-library                -- list reference examples
GET    /api/audit-log                        -- admin only: list audit entries
```

## Build order — please follow this sequence so there's always something demoable

1. Project scaffold: FastAPI backend + Next.js frontend + Docker Compose (postgres+pgvector, redis) wired together, health-check endpoint working end to end.
2. Auth + roles (operator/approver/admin), and the `LLMProvider` interface with the Gemini implementation wired in from the start (not retrofitted later).
3. Ingestion + normalization for text and PDF only first, plus the sensitivity classifier and upload validation (file-type allowlist, size cap) gating what reaches the LLM provider.
4. Context analysis (single Gemini call, structured output) + one generator (start with LinkedIn Post — shortest output, easiest to verify correctness) + hash-chain, hallucination guardrail, and confidence score on `generated_outputs` from the start — build these alongside the first generator, not after it.
5. Add the remaining generators one at a time: Advisory, Executive Summary, Twitter/X, Presentation, then Video and Infographic last since they're the most complex structured outputs. Every new generator gets the same grounding check and confidence score as the first one.
6. Approval workflow (draft/approved/published) + audit log wired into every mutating action.
7. Wire up Celery async job handling + the frontend dashboard: content input, multi-select checklist, params form, job-status polling, tabbed preview of each generated format showing its confidence score and any ungrounded-claim flags, approve/publish UI for approver role.
8. Add image and video/audio ingestion via the Gemini Files API.
9. Add the Reference Library / style-RAG feature, seeded with a few synthetic example documents.
10. Stretch, if time allows: a demo metric ("N formats generated in T seconds vs. ~2 hours manual"); a non-English (e.g. Hindi) generation pass to show language-parameter support actually working; a real local-model implementation behind the `LLMProvider` interface instead of a placeholder.

## What I need from you right now

Start at step 1. Propose the exact folder structure for both the backend and frontend, generate the Docker Compose file, the FastAPI app skeleton with the health-check endpoint, and the Next.js project scaffold with Tailwind and shadcn/ui configured. Explain any setup steps I need to run manually (installing the CLI tools, running docker compose up, etc.) before we move to step 2.

## How to handle decisions as we go

Don't stop to ask me clarifying questions about implementation details, naming, folder layout, library choices within the stated stack, or anything else you can reasonably decide yourself — just pick whatever you judge to be the best, most idiomatic option for each piece and keep moving. Use your own judgment throughout, including on anything not explicitly specified above. State the assumption you made in a line or two so I can see it and correct you if needed, but don't block on my answer — keep building. The one thing I do want you to hold for confirmation is the plan/step boundary already mentioned above (confirm before generating a large amount of code at the start of each numbered step) — that's a checkpoint, not a question.
