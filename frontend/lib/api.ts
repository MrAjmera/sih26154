import { GeneratedOutput } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function checkBackendHealth(): Promise<{ status: string } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

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
    formatType: o.format_type as GeneratedOutput["formatType"],
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
