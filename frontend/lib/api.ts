import { ContextAnalysis, FormatType, GeneratedOutput, JobStage, SensitivityLevel } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// Only these two formats have a real generator wired up on the backend today
// (Feature 3). Everything else in FormatType is still mock-engine-only.
export const BACKEND_SUPPORTED_FORMATS: FormatType[] = ["advisory", "linkedin"];

const FRONTEND_TO_BACKEND_FORMAT: Partial<Record<FormatType, string>> = {
  advisory: "advisory",
  linkedin: "linkedin_post",
};
const BACKEND_TO_FRONTEND_FORMAT: Record<string, FormatType> = {
  advisory: "advisory",
  linkedin_post: "linkedin",
};

export function toBackendFormats(formats: FormatType[]): string[] {
  return formats.map((f) => FRONTEND_TO_BACKEND_FORMAT[f]).filter((f): f is string => !!f);
}

function toFrontendFormat(backendFormat: string): FormatType {
  return BACKEND_TO_FRONTEND_FORMAT[backendFormat] ?? (backendFormat as FormatType);
}

export async function checkBackendHealth(): Promise<{ status: string } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// --- submissions ---

interface ApiSubmission {
  id: string;
  source_type: string;
  normalized_text: string;
  sensitivity_flag: string;
  created_at: string;
}

export interface CreatedSubmission {
  id: string;
  normalizedText: string;
  sensitivity: SensitivityLevel;
  createdAt: string;
}

function mapSubmission(s: ApiSubmission): CreatedSubmission {
  return {
    id: s.id,
    normalizedText: s.normalized_text,
    sensitivity: (s.sensitivity_flag as SensitivityLevel) ?? "clear",
    createdAt: s.created_at,
  };
}

/** Create a text/prompt submission on the real backend. Returns null on any failure
 *  so callers can fall back to the local demo engine. */
export async function createTextSubmission(text: string, sourceType: "text" | "prompt"): Promise<CreatedSubmission | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ normalized_text: text, source_type: sourceType }),
    });
    if (!res.ok) return null;
    return mapSubmission(await res.json());
  } catch {
    return null;
  }
}

/** Upload an image; the backend sends it to Gemini vision for a text description
 *  and creates a submission from that description. Returns null on any failure. */
export async function createImageSubmission(file: File): Promise<CreatedSubmission | null> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE_URL}/api/submissions/image`, { method: "POST", body: form });
    if (!res.ok) return null;
    return mapSubmission(await res.json());
  } catch {
    return null;
  }
}

// --- generation jobs ---

export interface StartedJob {
  jobId: string;
  status: string;
}

export async function startGeneration(submissionId: string, formats: FormatType[]): Promise<StartedJob | null> {
  const backendFormats = toBackendFormats(formats);
  if (backendFormats.length === 0) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/submissions/${submissionId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formats: backendFormats }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { jobId: data.job_id, status: data.status };
  } catch {
    return null;
  }
}

interface ApiJob {
  job_id: string;
  submission_id: string;
  status: string;
  requested_formats: string[];
  context_analysis: {
    core_message: string;
    key_entities: string[];
    detected_tone: string;
    suggested_objective: string;
  } | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface FetchedJob {
  jobId: string;
  submissionId: string;
  status: string;
  stage: JobStage;
  requestedFormats: FormatType[];
  contextAnalysis?: ContextAnalysis;
  error: string | null;
  completedAt: string | null;
}

const TERMINAL_STATUSES = new Set(["completed", "completed_with_errors", "failed"]);

export function isTerminalJobStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

function mapJobStage(status: string): JobStage {
  switch (status) {
    case "queued":
      return "queued";
    case "processing":
      return "generating";
    case "completed":
    case "completed_with_errors":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "queued";
  }
}

export async function fetchJob(submissionId: string, jobId: string): Promise<FetchedJob | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/submissions/${submissionId}/jobs/${jobId}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: ApiJob = await res.json();
    return {
      jobId: data.job_id,
      submissionId: data.submission_id,
      status: data.status,
      stage: mapJobStage(data.status),
      requestedFormats: data.requested_formats.map(toFrontendFormat),
      contextAnalysis: data.context_analysis
        ? {
            coreMessage: data.context_analysis.core_message,
            keyEntities: data.context_analysis.key_entities,
            detectedTone: data.context_analysis.detected_tone,
            suggestedObjective: data.context_analysis.suggested_objective,
          }
        : undefined,
      error: data.error,
      completedAt: data.completed_at,
    };
  } catch {
    return null;
  }
}

// --- generated outputs ---

// Wire shape returned by GET /api/outputs/{job_id} -> our frontend GeneratedOutput shape.
interface ApiGeneratedOutput {
  id: string;
  job_id: string;
  format_type: string;
  content: { text: string };
  content_hash: string;
  previous_hash: string;
  status: GeneratedOutput["status"];
  approved_by?: string | null;
  approved_at?: string | null;
  confidence_score: number;
  grounding_pass_rate: number;
  format_compliance_ok: boolean;
  ungrounded_flags: { claim: string; reason: string }[];
  confidence_factors: string[];
  created_at: string;
}

function mapOutput(o: ApiGeneratedOutput): GeneratedOutput {
  return {
    id: o.id,
    jobId: o.job_id,
    formatType: toFrontendFormat(o.format_type),
    content: o.content.text,
    contentHash: o.content_hash,
    previousHash: o.previous_hash,
    status: o.status,
    approvedBy: o.approved_by ?? undefined,
    approvedAt: o.approved_at ?? undefined,
    confidenceScore: Math.round(o.confidence_score * 100),
    groundingPassRate: o.grounding_pass_rate,
    formatComplianceOk: o.format_compliance_ok,
    ungroundedFlags: o.ungrounded_flags,
    createdAt: o.created_at,
  };
}

/** Fetch real generated outputs (with hallucination-guardrail flags) for a job.
 *  Returns null on any failure so callers can fall back to the local demo engine. */
export async function fetchOutputsForJob(jobId: string): Promise<GeneratedOutput[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/outputs/${jobId}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: ApiGeneratedOutput[] = await res.json();
    return data.map(mapOutput);
  } catch {
    return null;
  }
}

export async function approveOutputApi(outputId: string): Promise<GeneratedOutput | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/outputs/${outputId}/approve`, { method: "POST" });
    if (!res.ok) return null;
    return mapOutput(await res.json());
  } catch {
    return null;
  }
}

export async function verifyOutputChainApi(outputId: string): Promise<{ ok: boolean; broken_at: string[] } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/outputs/${outputId}/verify`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
