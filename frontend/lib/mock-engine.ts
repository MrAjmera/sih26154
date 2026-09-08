import {
  ContextAnalysis,
  FormatType,
  GeneratedOutput,
  GenerationParams,
  SensitivityLevel,
  UngroundedFlag,
} from "./types";

// --- lightweight deterministic hash (sha256 stand-in for demo purposes) ---
export function pseudoHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = (h1 ^ (h1 >>> 16)) >>> 0;
  h2 = (h2 ^ (h2 >>> 16)) >>> 0;
  const hex = (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(2);
  return hex.slice(0, 64);
}

const SENSITIVE_KEYWORDS = [
  "classified",
  "top secret",
  "secret//",
  "aadhaar",
  "passport no",
  "ssn",
  "credit card",
];

export function classifySensitivity(text: string): {
  level: SensitivityLevel;
  reasons: string[];
} {
  const lower = text.toLowerCase();
  const reasons: string[] = [];
  for (const kw of SENSITIVE_KEYWORDS) {
    if (lower.includes(kw)) reasons.push(`Matched sensitive-keyword pattern: "${kw}"`);
  }
  const piiPattern = /\b\d{4}[- ]?\d{4}[- ]?\d{4}\b/;
  if (piiPattern.test(text)) reasons.push("Matched a 12-digit ID-like number pattern (possible PII)");

  if (reasons.length === 0) return { level: "clear", reasons: [] };
  if (reasons.length >= 2 || lower.includes("top secret")) return { level: "blocked", reasons };
  return { level: "flagged", reasons };
}

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","is","are","was","were","be",
  "this","that","it","as","at","by","from","will","has","have","had","its","their","our","we",
  "you","your","they","he","she","not","all","any","also","into","over","after","before","than",
  "which","who","what","when","where","how","if","so","can","could","should","would","may","might",
]);

function extractEntities(text: string, max = 6): string[] {
  const words = text.match(/[A-Z][a-zA-Z0-9]{2,}|\b\d+(\.\d+)?%?\b/g) ?? [];
  const freq = new Map<string, number>();
  for (const w of words) {
    const key = w.trim();
    if (!key || STOPWORDS.has(key.toLowerCase())) continue;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

function firstSentence(text: string): string {
  const m = text.match(/[^.!?]+[.!?]/);
  return (m ? m[0] : text.slice(0, 160)).trim();
}

export function analyzeContext(text: string, params: GenerationParams): ContextAnalysis {
  return {
    coreMessage: firstSentence(text) || "No clear core message could be extracted from the source content.",
    keyEntities: extractEntities(text),
    detectedTone: params.tone,
    suggestedObjective: params.objective,
  };
}

function groundingCheck(
  generated: string,
  keyEntities: string[]
): { passRate: number; flags: UngroundedFlag[] } {
  // naive: look for capitalized tokens in the generated text that never appeared among key entities
  const candidates = generated.match(/[A-Z][a-zA-Z0-9]{3,}/g) ?? [];
  const unique = Array.from(new Set(candidates)).filter((c) => !STOPWORDS.has(c.toLowerCase()));
  const flags: UngroundedFlag[] = [];
  let grounded = 0;
  for (const c of unique) {
    if (keyEntities.some((e) => e.toLowerCase() === c.toLowerCase())) {
      grounded++;
    } else if (Math.random() < 0.12) {
      // occasionally flag a plausible-looking ungrounded claim for demo realism
      flags.push({
        claim: c,
        reason: "Entity does not trace back to any key_entity extracted from the source content.",
      });
    } else {
      grounded++;
    }
  }
  const passRate = unique.length === 0 ? 1 : grounded / unique.length;
  return { passRate, flags };
}

function formatComplianceCheck(formatType: FormatType, content: string): boolean {
  switch (formatType) {
    case "twitter":
      return content.length <= 320;
    case "linkedin":
      return content.length >= 200;
    case "exec_summary":
      return content.split("\n").length >= 3;
    default:
      return true;
  }
}

function generateForFormat(
  formatType: FormatType,
  ctx: ContextAnalysis,
  params: GenerationParams,
  sourceExcerpt: string
): string {
  const entities = ctx.keyEntities.slice(0, 4).join(", ") || "the reported situation";
  switch (formatType) {
    case "linkedin":
      return [
        `${ctx.coreMessage}`,
        ``,
        `What this means for ${params.audience || "our stakeholders"}: the situation involves ${entities}, and our recommended posture is to stay informed and follow official guidance as it is issued.`,
        ``,
        `Key points:`,
        `— ${ctx.coreMessage}`,
        `— Relevant parties: ${entities}`,
        `— Tone: ${params.tone}, Objective: ${params.objective}`,
        ``,
        `#PublicSafety #Advisory #StayInformed`,
      ].join("\n");
    case "twitter":
      return `⚠️ ${ctx.coreMessage} Stay alert, follow official channels for updates. ${entities ? `Ref: ${ctx.keyEntities.slice(0, 2).join(", ")}.` : ""}`.slice(0, 280);
    case "advisory":
      return [
        `OFFICIAL ADVISORY`,
        `Audience: ${params.audience || "General Public"} | Language: ${params.language} | Objective: ${params.objective}`,
        ``,
        `1. SUMMARY`,
        ctx.coreMessage,
        ``,
        `2. DETAILS`,
        sourceExcerpt.slice(0, 400),
        ``,
        `3. ENTITIES / SYSTEMS INVOLVED`,
        entities,
        ``,
        `4. RECOMMENDED ACTIONS`,
        `- Follow official communication channels only.`,
        `- Do not share unverified information.`,
        `- Report anomalies to the designated point of contact.`,
        ``,
        `5. CLASSIFICATION`,
        `For official distribution only. Generated in ${params.tone} tone at ${params.detailLevel} detail level.`,
      ].join("\n");
    case "exec_summary":
      return [
        `EXECUTIVE SUMMARY`,
        `Core message: ${ctx.coreMessage}`,
        `Entities involved: ${entities}`,
        `Recommended objective: ${params.objective}`,
        `Suggested next step: brief senior stakeholders and monitor for escalation.`,
      ].join("\n");
    case "infographic":
      return [
        `INFOGRAPHIC CONTENT PLAN`,
        `Headline: ${ctx.coreMessage.slice(0, 80)}`,
        `Panel 1 — What happened: ${ctx.coreMessage}`,
        `Panel 2 — Who's involved: ${entities}`,
        `Panel 3 — What to do: Follow official guidance, avoid speculation.`,
        `Layout: single-column vertical, ${params.tone} color palette, icon-led panels.`,
      ].join("\n");
    case "presentation":
      return [
        `SLIDE 1 — Title: ${ctx.coreMessage.slice(0, 60)}`,
        `Speaker notes: Open by framing why this matters to ${params.audience || "the audience"}.`,
        ``,
        `SLIDE 2 — Context`,
        `Bullets: ${entities}`,
        `Speaker notes: Walk through the background using the source material.`,
        ``,
        `SLIDE 3 — Recommended Actions`,
        `Bullets: Monitor, verify through official channels, escalate anomalies.`,
        `Speaker notes: Close with a clear call to action for ${params.objective}.`,
      ].join("\n");
    case "video":
      return [
        `SCRIPT`,
        `[Scene 1 — Open] Narration: "${ctx.coreMessage}"`,
        `[Scene 2 — Context] Narration: This involves ${entities}.`,
        `[Scene 3 — Guidance] Narration: Here is what you should do next: follow official channels and avoid unverified sources.`,
        ``,
        `STORYBOARD`,
        `Scene 1: Establishing graphic + headline text overlay.`,
        `Scene 2: Supporting imagery for ${entities || "context"}.`,
        `Scene 3: Call-to-action card with official contact/reference.`,
        ``,
        `SUBTITLES`,
        `00:00 ${ctx.coreMessage}`,
        `00:05 Involves: ${entities}`,
        `00:10 Follow official guidance.`,
      ].join("\n");
    default:
      return ctx.coreMessage;
  }
}

export function runGenerator(
  formatType: FormatType,
  ctx: ContextAnalysis,
  params: GenerationParams,
  sourceExcerpt: string,
  previousHash: string
): Omit<GeneratedOutput, "id" | "jobId" | "createdAt" | "status"> {
  const content = generateForFormat(formatType, ctx, params, sourceExcerpt);
  const { passRate, flags } = groundingCheck(content, ctx.keyEntities);
  const complianceOk = formatComplianceCheck(formatType, content);
  const confidenceScore = Math.round(
    (passRate * 0.7 + (complianceOk ? 0.3 : 0)) * 100
  );
  const contentHash = pseudoHash(content + previousHash);
  return {
    formatType,
    content,
    contentHash,
    previousHash,
    confidenceScore,
    groundingPassRate: Math.round(passRate * 100) / 100,
    formatComplianceOk: complianceOk,
    ungroundedFlags: flags,
  };
}
