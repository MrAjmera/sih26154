"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { FORMAT_LABELS, GeneratedOutput } from "@/lib/types";
import { ArrowLeft, BadgeCheck, CheckCircle2, Fingerprint, Send, ShieldAlert } from "lucide-react";

const statusVariant: Record<GeneratedOutput["status"], "secondary" | "success" | "default"> = {
  draft: "secondary",
  approved: "success",
  published: "default",
};

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const { user, getJob, getSubmission, getOutputsForJob, approveOutput, publishOutput, verifyIntegrity } = useStore();
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; brokenAt: string[] } | null>(null);
  const [, forceTick] = useState(0);

  const job = getJob(params.jobId);
  const submission = job ? getSubmission(job.submissionId) : undefined;
  const outputs = job ? getOutputsForJob(job.id) : [];

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  // re-render every 700ms while the job is in flight so stage/output changes show up live
  useEffect(() => {
    if (!job || job.stage === "completed" || job.stage === "blocked" || job.stage === "failed") return;
    const t = setInterval(() => forceTick((n) => n + 1), 700);
    return () => clearInterval(t);
  }, [job]);

  if (!user) return null;
  if (!job || !submission) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-muted-foreground">Job not found.</p>
        <Button variant="link" onClick={() => router.push("/dashboard")}>Back to dashboard</Button>
      </main>
    );
  }

  const canApprove = user.role === "approver" || user.role === "admin";
  const orderedOutputs = job.requestedFormats
    .map((f) => outputs.find((o) => o.formatType === f))
    .filter((o): o is GeneratedOutput => !!o);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")} className="mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Button>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Job {job.id}</CardTitle>
              <Badge variant={job.stage === "completed" ? "success" : job.stage === "blocked" ? "destructive" : "warning"} className="capitalize">
                {job.stage}
              </Badge>
            </div>
            <CardDescription>Submitted {new Date(job.createdAt).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-1 text-sm font-medium">Source excerpt</p>
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">{submission.rawExcerpt}…</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sensitivity classification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge
              variant={submission.sensitivity === "clear" ? "success" : submission.sensitivity === "flagged" ? "warning" : "destructive"}
              className="capitalize"
            >
              {submission.sensitivity}
            </Badge>
            {submission.sensitivityReasons.length > 0 ? (
              <ul className="list-inside list-disc text-xs text-muted-foreground">
                {submission.sensitivityReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No sensitive-keyword or PII patterns matched.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Pipeline</CardTitle>
          <CardDescription>Six-stage pipeline — this is exactly what runs behind every submission.</CardDescription>
        </CardHeader>
        <CardContent>
          <PipelineStepper stage={job.stage} />
        </CardContent>
      </Card>

      {job.contextAnalysis && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Context &amp; intent analysis</CardTitle>
            <CardDescription>Every generator below is grounded against this shared analysis.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Core message</p>
              <p className="text-sm">{job.contextAnalysis.coreMessage}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Key entities</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {job.contextAnalysis.keyEntities.map((e) => (
                  <Badge key={e} variant="outline">{e}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Detected tone</p>
              <p className="text-sm capitalize">{job.contextAnalysis.detectedTone}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Suggested objective</p>
              <p className="text-sm capitalize">{job.contextAnalysis.suggestedObjective}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {orderedOutputs.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Generated outputs</CardTitle>
                <CardDescription>Tabbed preview per format — confidence score, grounding flags, approval status.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => setVerifyResult(await verifyIntegrity(job.id))}
              >
                <Fingerprint className="h-4 w-4" /> Verify hash-chain integrity
              </Button>
            </div>
            {verifyResult && (
              <div
                className={`mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  verifyResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
                }`}
              >
                {verifyResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                {verifyResult.ok
                  ? "Chain verified — no output has been altered since generation."
                  : `Tamper detected in: ${verifyResult.brokenAt.join(", ")}`}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={orderedOutputs[0].formatType}>
              <TabsList>
                {orderedOutputs.map((o) => (
                  <TabsTrigger key={o.id} value={o.formatType}>
                    {FORMAT_LABELS[o.formatType]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {orderedOutputs.map((o) => (
                <TabsContent key={o.id} value={o.formatType} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="md:col-span-2 space-y-3">
                      <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-4 font-sans text-sm">
                        {o.content}
                      </pre>
                      {o.ungroundedFlags.length > 0 && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-800">
                            <ShieldAlert className="h-4 w-4" /> Hallucination guardrail flags
                          </p>
                          <ul className="list-inside list-disc text-xs text-amber-800">
                            {o.ungroundedFlags.map((f, i) => (
                              <li key={i}>
                                <span className="font-medium">{f.claim}</span> — {f.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-muted-foreground">Confidence score</span>
                          <span className="font-semibold">{o.confidenceScore}%</span>
                        </div>
                        <Progress value={o.confidenceScore} />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Grounding pass rate {Math.round(o.groundingPassRate * 100)}% · format compliance{" "}
                          {o.formatComplianceOk ? "OK" : "failed"}
                        </p>
                      </div>
                      <Separator />
                      <div className="space-y-1 text-xs">
                        <p className="font-medium text-muted-foreground">Tamper-evidence hash</p>
                        <p className="break-all font-mono text-[10px] text-muted-foreground">{o.contentHash}</p>
                      </div>
                      <Separator />
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant[o.status]} className="capitalize">{o.status}</Badge>
                        {o.approvedBy && (
                          <span className="text-xs text-muted-foreground">by {o.approvedBy}</span>
                        )}
                      </div>
                      {canApprove && o.status === "draft" && (
                        <Button size="sm" className="w-full" onClick={() => approveOutput(o.id)}>
                          <BadgeCheck className="h-4 w-4" /> Approve
                        </Button>
                      )}
                      {canApprove && o.status === "approved" && (
                        <Button size="sm" variant="secondary" className="w-full" onClick={() => publishOutput(o.id)}>
                          <Send className="h-4 w-4" /> Publish
                        </Button>
                      )}
                      {!canApprove && o.status === "draft" && (
                        <p className="text-xs text-muted-foreground">Awaiting approver/admin sign-off.</p>
                      )}
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
