"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AuditLogEntry,
  FormatType,
  GeneratedOutput,
  GenerationParams,
  Job,
  JobStage,
  ReferenceDocument,
  Role,
  SourceType,
  Submission,
  User,
} from "./types";
import { analyzeContext, classifySensitivity, pseudoHash, runGenerator } from "./mock-engine";
import {
  BACKEND_SUPPORTED_FORMATS,
  checkBackendHealth,
  createImageSubmission,
  createTextSubmission,
  fetchJob,
  fetchOutputsForJob,
  approveOutputApi,
  verifyOutputChainApi,
  isTerminalJobStatus,
  startGeneration,
} from "./api";

const STORAGE_KEY = "sih26154_demo_state_v1";

interface DemoState {
  user: User | null;
  submissions: Submission[];
  jobs: Job[];
  outputs: GeneratedOutput[];
  auditLog: AuditLogEntry[];
  referenceLibrary: ReferenceDocument[];
  realJobIds: string[];
}

const DEMO_USERS: Record<Role, User> = {
  operator: { id: "u-operator", email: "operator@ntro.demo", name: "Operator (Comms Cell)", role: "operator" },
  approver: { id: "u-approver", email: "approver@ntro.demo", name: "Approver (Duty Officer)", role: "approver" },
  admin: { id: "u-admin", email: "admin@ntro.demo", name: "Admin (System Owner)", role: "admin" },
};

const SEED_REFERENCE_LIBRARY: ReferenceDocument[] = [
  {
    id: "ref-1",
    formatType: "advisory",
    title: "Sample: Phishing Campaign Advisory",
    content:
      "OFFICIAL ADVISORY\nA phishing campaign impersonating a government payment portal has been observed. Recipients should not click embedded links and should verify URLs before entering credentials.",
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  },
  {
    id: "ref-2",
    formatType: "linkedin",
    title: "Sample: Cyber Hygiene LinkedIn Post",
    content:
      "This week our team ran a cyber-hygiene refresher across departments. A few reminders: rotate credentials, enable MFA, and report suspicious emails immediately. #CyberSecurity",
    createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
  },
];

function loadState(): DemoState {
  if (typeof window === "undefined") {
    return { user: null, submissions: [], jobs: [], outputs: [], auditLog: [], referenceLibrary: SEED_REFERENCE_LIBRARY, realJobIds: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      return {
        ...parsed,
        referenceLibrary: parsed.referenceLibrary && parsed.referenceLibrary.length ? parsed.referenceLibrary : SEED_REFERENCE_LIBRARY,
        realJobIds: parsed.realJobIds ?? [],
      };
    }
  } catch {
    // ignore corrupted storage
  }
  return { user: null, submissions: [], jobs: [], outputs: [], auditLog: [], referenceLibrary: SEED_REFERENCE_LIBRARY, realJobIds: [] };
}

interface StoreContextValue extends DemoState {
  backendAvailable: boolean | null;
  login: (role: Role) => void;
  logout: () => void;
  submitContent: (args: {
    sourceType: SourceType;
    rawText: string;
    imageFile?: File;
    params: GenerationParams;
    requestedFormats: FormatType[];
  }) => Promise<{ submissionId: string; jobId: string } | null>;
  approveOutput: (outputId: string) => void;
  publishOutput: (outputId: string) => void;
  verifyIntegrity: (jobId: string) => Promise<{ ok: boolean; brokenAt: string[] }>;
  addReferenceDocument: (doc: Omit<ReferenceDocument, "id" | "createdAt">) => void;
  getJob: (jobId: string) => Job | undefined;
  getOutputsForJob: (jobId: string) => GeneratedOutput[];
  getSubmission: (submissionId: string) => Submission | undefined;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const STAGE_SEQUENCE: JobStage[] = ["queued", "ingesting", "classifying", "analyzing", "generating", "completed"];

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoState>(() => ({
    user: null,
    submissions: [],
    jobs: [],
    outputs: [],
    auditLog: [],
    referenceLibrary: SEED_REFERENCE_LIBRARY,
    realJobIds: [],
  }));
  const [hydrated, setHydrated] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    checkBackendHealth().then((h) => setBackendAvailable(!!h));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // best-effort only
    }
  }, [state, hydrated]);

  const pushAudit = useCallback((partial: Omit<AuditLogEntry, "id" | "createdAt" | "userId" | "userName">, actingUser?: User | null) => {
    setState((s) => {
      const user = actingUser ?? s.user;
      const entry: AuditLogEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: user?.id ?? "system",
        userName: user?.name ?? "System",
        createdAt: new Date().toISOString(),
        ...partial,
      };
      return { ...s, auditLog: [entry, ...s.auditLog] };
    });
  }, []);

  const login = useCallback(
    (role: Role) => {
      const user = DEMO_USERS[role];
      setState((s) => ({ ...s, user }));
      pushAudit({ action: "login", entityType: "user", entityId: user.id }, user);
    },
    [pushAudit]
  );

  const logout = useCallback(() => {
    setState((s) => ({ ...s, user: null }));
  }, []);

  // Polls a real backend job until it reaches a terminal status, then pulls
  // the generated outputs. Recursive setTimeout rather than setInterval so a
  // slow request can't stack up overlapping polls.
  const pollRealJob = useCallback(
    (jobId: string, submissionId: string, user: User) => {
      const tick = async () => {
        const job = await fetchJob(submissionId, jobId);
        if (!job) {
          setTimeout(tick, 2000);
          return;
        }

        setState((s) => ({
          ...s,
          jobs: s.jobs.map((j) =>
            j.id === jobId ? { ...j, stage: job.stage, contextAnalysis: job.contextAnalysis ?? j.contextAnalysis } : j
          ),
        }));

        if (!isTerminalJobStatus(job.status)) {
          setTimeout(tick, 1500);
          return;
        }

        const outputs = await fetchOutputsForJob(jobId);
        setState((s) => ({
          ...s,
          outputs: outputs ? [...outputs, ...s.outputs.filter((o) => o.jobId !== jobId)] : s.outputs,
          jobs: s.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  stage: job.status === "failed" ? "failed" : "completed",
                  completedFormats: outputs ? outputs.map((o) => o.formatType) : j.completedFormats,
                  completedAt: job.completedAt ?? new Date().toISOString(),
                }
              : j
          ),
        }));
        pushAudit(
          {
            action: job.status === "failed" ? "job_failed" : "job_completed",
            entityType: "job",
            entityId: jobId,
          },
          user
        );
      };
      setTimeout(tick, 400);
    },
    [pushAudit]
  );

  const submitContent = useCallback(
    async (args: {
      sourceType: SourceType;
      rawText: string;
      imageFile?: File;
      params: GenerationParams;
      requestedFormats: FormatType[];
    }): Promise<{ submissionId: string; jobId: string } | null> => {
      const user = state.user ?? DEMO_USERS.operator;

      if (args.sourceType === "image" && !args.imageFile) {
        // No offline path for image ingestion — it requires the real Gemini vision call.
        return null;
      }

      if (backendAvailable) {
        const supportedFormats = args.requestedFormats.filter((f) => BACKEND_SUPPORTED_FORMATS.includes(f));
        if (supportedFormats.length === 0) {
          // nothing the real backend can generate — fall through to mock demo below
        } else {
          const created =
            args.sourceType === "image" && args.imageFile
              ? await createImageSubmission(args.imageFile)
              : await createTextSubmission(args.rawText, args.sourceType === "prompt" ? "prompt" : "text");

          if (created) {
            const started = await startGeneration(created.id, supportedFormats);
            if (started) {
              const submission: Submission = {
                id: created.id,
                userId: user.id,
                sourceType: args.sourceType,
                rawExcerpt: created.normalizedText.slice(0, 240),
                normalizedText: created.normalizedText,
                sensitivity: created.sensitivity,
                sensitivityReasons: [],
                params: args.params,
                requestedFormats: supportedFormats,
                createdAt: created.createdAt,
              };
              const job: Job = {
                id: started.jobId,
                submissionId: created.id,
                stage: "queued",
                requestedFormats: supportedFormats,
                completedFormats: [],
                createdAt: new Date().toISOString(),
              };

              setState((s) => ({
                ...s,
                submissions: [submission, ...s.submissions],
                jobs: [job, ...s.jobs],
                realJobIds: [started.jobId, ...s.realJobIds],
              }));
              pushAudit({ action: "submission_created", entityType: "submission", entityId: created.id }, user);
              pushAudit({ action: "job_enqueued", entityType: "job", entityId: started.jobId }, user);

              pollRealJob(started.jobId, created.id, user);
              return { submissionId: created.id, jobId: started.jobId };
            }
          }
          // backend reachable but this call failed (e.g. bad upload) — fall through to mock
        }
      }

      if (args.sourceType === "image") {
        // No offline path for image ingestion — it requires the real Gemini vision call.
        return null;
      }

      const { level, reasons } = classifySensitivity(args.rawText);
      const submissionId = `sub-${Date.now()}`;
      const jobId = `job-${Date.now()}`;
      const submission: Submission = {
        id: submissionId,
        userId: user.id,
        sourceType: args.sourceType,
        rawExcerpt: args.rawText.slice(0, 240),
        normalizedText: args.rawText,
        sensitivity: level,
        sensitivityReasons: reasons,
        params: args.params,
        requestedFormats: args.requestedFormats,
        createdAt: new Date().toISOString(),
      };
      const job: Job = {
        id: jobId,
        submissionId,
        stage: level === "blocked" ? "blocked" : "queued",
        requestedFormats: args.requestedFormats,
        completedFormats: [],
        createdAt: new Date().toISOString(),
      };

      setState((s) => ({
        ...s,
        submissions: [submission, ...s.submissions],
        jobs: [job, ...s.jobs],
      }));
      pushAudit({ action: "submission_created", entityType: "submission", entityId: submissionId }, user);

      if (level === "blocked") {
        pushAudit({ action: "job_blocked_sensitivity", entityType: "job", entityId: jobId }, user);
        return { submissionId, jobId };
      }

      pushAudit({ action: "job_enqueued", entityType: "job", entityId: jobId }, user);
      runMockPipeline(jobId, submission, user);
      return { submissionId, jobId };
    },
    [state.user, backendAvailable, pushAudit, pollRealJob]
  );

  const runMockPipeline = useCallback(
    (jobId: string, submission: Submission, user: User) => {
      let stageIdx = 0;
      const advance = () => {
        stageIdx++;
        const stage = STAGE_SEQUENCE[Math.min(stageIdx, STAGE_SEQUENCE.length - 1)];
        setState((s) => ({
          ...s,
          jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, stage } : j)),
        }));

        if (stage === "analyzing") {
          const ctx = analyzeContext(submission.normalizedText, submission.params);
          setState((s) => ({
            ...s,
            jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, contextAnalysis: ctx } : j)),
          }));
          pushAudit({ action: "context_analysis_completed", entityType: "job", entityId: jobId }, user);
        }

        if (stage === "generating") {
          setState((s) => {
            const job = s.jobs.find((j) => j.id === jobId);
            const ctx = job?.contextAnalysis ?? analyzeContext(submission.normalizedText, submission.params);
            let previousHash = pseudoHash(`genesis-${jobId}`);
            const newOutputs: GeneratedOutput[] = submission.requestedFormats.map((format) => {
              const generated = runGenerator(format, ctx, submission.params, submission.normalizedText, previousHash);
              previousHash = generated.contentHash;
              return {
                id: `out-${jobId}-${format}`,
                jobId,
                status: "draft",
                createdAt: new Date().toISOString(),
                ...generated,
              };
            });
            return {
              ...s,
              outputs: [...newOutputs, ...s.outputs],
              jobs: s.jobs.map((j) =>
                j.id === jobId ? { ...j, completedFormats: submission.requestedFormats } : j
              ),
            };
          });
          pushAudit(
            { action: `generated_${submission.requestedFormats.length}_formats`, entityType: "job", entityId: jobId },
            user
          );
        }

        if (stage === "completed") {
          setState((s) => ({
            ...s,
            jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, completedAt: new Date().toISOString() } : j)),
          }));
          pushAudit({ action: "job_completed", entityType: "job", entityId: jobId }, user);
          return;
        }

        setTimeout(advance, 650 + Math.random() * 500);
      };
      setTimeout(advance, 500);
    },
    [pushAudit]
  );

  const approveOutput = useCallback(
    (outputId: string) => {
      const user = state.user;
      const output = state.outputs.find((o) => o.id === outputId);
      const isReal = output && state.realJobIds.includes(output.jobId);

      if (isReal) {
        approveOutputApi(outputId).then((updated) => {
          if (!updated) return;
          setState((s) => ({
            ...s,
            outputs: s.outputs.map((o) => (o.id === outputId ? updated : o)),
          }));
          pushAudit({ action: "output_approved", entityType: "generated_output", entityId: outputId }, user);
        });
        return;
      }

      setState((s) => ({
        ...s,
        outputs: s.outputs.map((o) =>
          o.id === outputId
            ? { ...o, status: "approved", approvedBy: user?.name, approvedAt: new Date().toISOString() }
            : o
        ),
      }));
      pushAudit({ action: "output_approved", entityType: "generated_output", entityId: outputId });
    },
    [state.user, state.outputs, state.realJobIds, pushAudit]
  );

  const publishOutput = useCallback(
    (outputId: string) => {
      // No backend "publish" endpoint exists yet — this is local-only for both
      // real and mock outputs.
      setState((s) => ({
        ...s,
        outputs: s.outputs.map((o) => (o.id === outputId ? { ...o, status: "published" } : o)),
      }));
      pushAudit({ action: "output_published", entityType: "generated_output", entityId: outputId });
    },
    [pushAudit]
  );

  const verifyIntegrity = useCallback(
    async (jobId: string): Promise<{ ok: boolean; brokenAt: string[] }> => {
      if (state.realJobIds.includes(jobId)) {
        const jobOutputs = state.outputs.filter((o) => o.jobId === jobId);
        const anchor = jobOutputs[0];
        if (anchor) {
          const result = await verifyOutputChainApi(anchor.id);
          if (result) {
            pushAudit({ action: "integrity_verified", entityType: "job", entityId: jobId });
            return { ok: result.ok, brokenAt: result.broken_at };
          }
        }
      }

      const jobOutputs = state.outputs.filter((o) => o.jobId === jobId).slice().reverse();
      let previousHash = pseudoHash(`genesis-${jobId}`);
      const brokenAt: string[] = [];
      for (const out of jobOutputs) {
        const recomputed = pseudoHash(out.content + previousHash);
        if (recomputed !== out.contentHash || out.previousHash !== previousHash) {
          brokenAt.push(out.formatType);
        }
        previousHash = out.contentHash;
      }
      pushAudit({ action: "integrity_verified", entityType: "job", entityId: jobId });
      return { ok: brokenAt.length === 0, brokenAt };
    },
    [state.outputs, state.realJobIds, pushAudit]
  );

  const addReferenceDocument = useCallback((doc: Omit<ReferenceDocument, "id" | "createdAt">) => {
    setState((s) => ({
      ...s,
      referenceLibrary: [
        { ...doc, id: `ref-${Date.now()}`, createdAt: new Date().toISOString() },
        ...s.referenceLibrary,
      ],
    }));
    pushAudit({ action: "reference_document_added", entityType: "reference_document", entityId: doc.title });
  }, [pushAudit]);

  const getJob = useCallback((jobId: string) => state.jobs.find((j) => j.id === jobId), [state.jobs]);
  const getOutputsForJob = useCallback(
    (jobId: string) => state.outputs.filter((o) => o.jobId === jobId),
    [state.outputs]
  );
  const getSubmission = useCallback(
    (submissionId: string) => state.submissions.find((s) => s.id === submissionId),
    [state.submissions]
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      ...state,
      backendAvailable,
      login,
      logout,
      submitContent,
      approveOutput,
      publishOutput,
      verifyIntegrity,
      addReferenceDocument,
      getJob,
      getOutputsForJob,
      getSubmission,
    }),
    [
      state,
      backendAvailable,
      login,
      logout,
      submitContent,
      approveOutput,
      publishOutput,
      verifyIntegrity,
      addReferenceDocument,
      getJob,
      getOutputsForJob,
      getSubmission,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
