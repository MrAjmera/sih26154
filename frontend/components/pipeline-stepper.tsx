"use client";

import { JobStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check, Loader2, ShieldAlert, XCircle } from "lucide-react";

const STAGES: { key: JobStage; label: string; hint: string }[] = [
  { key: "queued", label: "Queued", hint: "Job accepted, waiting for a worker" },
  { key: "ingesting", label: "Ingestion & Normalization", hint: "Converging input into { text, source_type, structure, metadata }" },
  { key: "classifying", label: "Sensitivity Classification", hint: "Scanning for PII / classification markings / sensitive keywords" },
  { key: "analyzing", label: "Context & Intent Analysis", hint: "One LLM call → core_message, key_entities, tone, objective" },
  { key: "generating", label: "Format Generation", hint: "Concurrent specialist generators + grounding check + confidence score" },
  { key: "completed", label: "Output Store & Delivery", hint: "Hash-chained, held as draft pending approval" },
];

export function PipelineStepper({ stage }: { stage: JobStage }) {
  if (stage === "blocked") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        <div>
          <div className="font-medium">Blocked at Sensitivity Classification</div>
          <div className="text-sm text-red-700">
            This submission was flagged as too sensitive to leave the app and was not sent to any LLM provider.
          </div>
        </div>
      </div>
    );
  }

  if (stage === "failed") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
        <XCircle className="h-5 w-5 shrink-0" />
        <div className="font-medium">Job failed</div>
      </div>
    );
  }

  const activeIdx = STAGES.findIndex((s) => s.key === stage);

  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {STAGES.map((s, idx) => {
        const done = idx < activeIdx || stage === "completed";
        const active = idx === activeIdx && stage !== "completed";
        return (
          <li
            key={s.key}
            className={cn(
              "flex items-start gap-3 rounded-md border p-3 transition-colors",
              done && "border-emerald-200 bg-emerald-50",
              active && "border-primary bg-primary/5",
              !done && !active && "border-border bg-muted/30"
            )}
          >
            <div
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                done && "bg-emerald-600 text-white",
                active && "bg-primary text-primary-foreground",
                !done && !active && "bg-muted text-muted-foreground"
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : idx + 1}
            </div>
            <div>
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-xs text-muted-foreground">{s.hint}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
