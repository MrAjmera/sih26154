export type Role = "operator" | "approver" | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export type SourceType = "text" | "document" | "image" | "video" | "prompt";

export type FormatType =
  | "video"
  | "linkedin"
  | "twitter"
  | "advisory"
  | "infographic"
  | "exec_summary"
  | "presentation";

export const FORMAT_LABELS: Record<FormatType, string> = {
  video: "Video",
  linkedin: "LinkedIn Post",
  twitter: "Twitter / X Post",
  advisory: "Advisory",
  infographic: "Infographic",
  exec_summary: "Executive Summary",
  presentation: "Presentation",
};

export type Tone = "formal" | "urgent" | "reassuring" | "neutral" | "technical";
export type Language = "English" | "Hindi";
export type DetailLevel = "brief" | "standard" | "detailed";
export type Objective = "inform" | "warn" | "advise" | "reassure" | "instruct";

export interface GenerationParams {
  audience: string;
  tone: Tone;
  language: Language;
  detailLevel: DetailLevel;
  objective: Objective;
  contentStyle: string;
}

export type SensitivityLevel = "clear" | "flagged" | "blocked";

export interface Submission {
  id: string;
  userId: string;
  sourceType: SourceType;
  rawExcerpt: string;
  normalizedText: string;
  sensitivity: SensitivityLevel;
  sensitivityReasons: string[];
  params: GenerationParams;
  requestedFormats: FormatType[];
  createdAt: string;
}

export type JobStage =
  | "queued"
  | "ingesting"
  | "classifying"
  | "analyzing"
  | "generating"
  | "completed"
  | "blocked"
  | "failed";

export interface Job {
  id: string;
  submissionId: string;
  stage: JobStage;
  requestedFormats: FormatType[];
  completedFormats: FormatType[];
  contextAnalysis?: ContextAnalysis;
  createdAt: string;
  completedAt?: string;
}

export interface ContextAnalysis {
  coreMessage: string;
  keyEntities: string[];
  detectedTone: string;
  suggestedObjective: string;
}

export type OutputStatus = "draft" | "approved" | "published";

export interface UngroundedFlag {
  claim: string;
  reason: string;
}

export interface GeneratedOutput {
  id: string;
  jobId: string;
  formatType: FormatType;
  content: string;
  contentHash: string;
  previousHash: string;
  status: OutputStatus;
  approvedBy?: string;
  approvedAt?: string;
  confidenceScore: number;
  groundingPassRate: number;
  formatComplianceOk: boolean;
  ungroundedFlags: UngroundedFlag[];
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

export interface ReferenceDocument {
  id: string;
  formatType: FormatType;
  title: string;
  content: string;
  createdAt: string;
}
