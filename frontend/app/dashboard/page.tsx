"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DetailLevel,
  FORMAT_LABELS,
  FormatType,
  GenerationParams,
  Job,
  Language,
  Objective,
  SourceType,
  Tone,
} from "@/lib/types";
import { BACKEND_SUPPORTED_FORMATS } from "@/lib/api";
import { ArrowRight, FileText, Image as ImageIcon, Sparkles, Video, MessageSquareText, Upload } from "lucide-react";

const SAMPLE_SOURCE = `A coordinated phishing campaign impersonating the National Cyber Coordination Portal has been detected targeting government employees. The emails contain a malicious link disguised as a mandatory password-reset notice. Approximately 1,200 mailboxes across three departments received the message in the last 24 hours. IT Security has already blocked the sender domain and is asking all staff to avoid clicking unexpected password-reset links and to report suspicious emails to the SOC helpdesk immediately.`;

const SOURCE_TYPES: { value: SourceType; label: string; icon: React.ReactNode }[] = [
  { value: "text", label: "Text", icon: <MessageSquareText className="h-4 w-4" /> },
  { value: "prompt", label: "Free-form prompt", icon: <Sparkles className="h-4 w-4" /> },
  { value: "document", label: "Document (PDF/DOCX)", icon: <FileText className="h-4 w-4" /> },
  { value: "image", label: "Image", icon: <ImageIcon className="h-4 w-4" /> },
  { value: "video", label: "Video", icon: <Video className="h-4 w-4" /> },
];

const ALL_FORMATS: FormatType[] = [
  "linkedin",
  "twitter",
  "advisory",
  "exec_summary",
  "infographic",
  "presentation",
  "video",
];

const stageColor: Record<Job["stage"], "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  queued: "secondary",
  ingesting: "secondary",
  classifying: "secondary",
  analyzing: "warning",
  generating: "warning",
  completed: "success",
  blocked: "destructive",
  failed: "destructive",
};

export default function DashboardPage() {
  const { user, submissions, jobs, submitContent, backendAvailable } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  const [sourceType, setSourceType] = useState<SourceType>("text");
  const [rawText, setRawText] = useState(SAMPLE_SOURCE);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audience, setAudience] = useState("Government employees & department IT leads");
  const [tone, setTone] = useState<Tone>("urgent");
  const [language, setLanguage] = useState<Language>("English");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("standard");
  const [objective, setObjective] = useState<Objective>("warn");
  const [contentStyle, setContentStyle] = useState("Plain-language security advisory");
  const [selectedFormats, setSelectedFormats] = useState<FormatType[]>(["advisory", "linkedin"]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!user) return null;

  const toggleFormat = (f: FormatType) => {
    setSelectedFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const hasContent = sourceType === "image" ? !!imageFile : !!rawText.trim();

  const handleSubmit = async () => {
    if (!hasContent || selectedFormats.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    const params: GenerationParams = { audience, tone, language, detailLevel, objective, contentStyle };
    const result = await submitContent({
      sourceType,
      rawText,
      imageFile: imageFile ?? undefined,
      params,
      requestedFormats: selectedFormats,
    });
    setSubmitting(false);
    if (result) {
      router.push(`/dashboard/jobs/${result.jobId}`);
    } else {
      setSubmitError("Submission failed — the backend may be unreachable or the upload was rejected. Try again.");
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Operator Dashboard</h1>
        <p className="text-muted-foreground">
          Submit source content once, generate every format you need from it — analyzed, grounded, and
          hash-chained for tamper-evidence.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>1. Source content</CardTitle>
            <CardDescription>Every input type converges into one normalized representation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {SOURCE_TYPES.map((st) => (
                <button
                  key={st.value}
                  onClick={() => setSourceType(st.value)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    sourceType === st.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {st.icon}
                  {st.label}
                </button>
              ))}
            </div>

            {sourceType === "text" || sourceType === "prompt" ? (
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={9}
                placeholder="Paste the source content or describe what you need..."
              />
            ) : sourceType === "image" ? (
              backendAvailable ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <input
                    id="image-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                  <label
                    htmlFor="image-upload"
                    className="flex cursor-pointer flex-col items-center gap-2 text-primary hover:underline"
                  >
                    <Upload className="h-5 w-5" />
                    {imageFile ? imageFile.name : "Choose an image to upload"}
                  </label>
                  <p className="mt-2 text-xs">
                    Sent to Gemini vision for a factual description, which becomes the normalized source text.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Image ingestion needs the live backend (Gemini vision) — it&apos;s unreachable right now, so this
                  demo is running on the offline mock engine, which doesn&apos;t support images.
                  <div className="mt-3">
                    <Button size="sm" variant="outline" onClick={() => setSourceType("text")}>
                      Use text input instead
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                {sourceType === "document" && "Document upload (PDF/DOCX parsed via pymupdf/python-docx) isn't wired up yet — switch to Text and paste the extracted content."}
                {sourceType === "video" && "Video upload (sent to Gemini for transcription) isn't wired up yet — switch to Text and paste the transcript/summary."}
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => setSourceType("text")}>
                    Use text input instead
                  </Button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {backendAvailable === null
                ? "Checking backend connection…"
                : backendAvailable
                ? "Connected to the live backend — submissions run through the real context analyzer and format generators (Gemini). Sensitivity classification isn't built yet, so every submission currently comes back \"clear.\""
                : "Backend unreachable — running on the offline demo engine. Every submission is scanned by a simulated sensitivity classifier before \"reaching\" any LLM provider; try adding a word like “classified” to see it get flagged or blocked."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Generation parameters</CardTitle>
            <CardDescription>Shared context every generator is grounded against.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Target audience</Label>
              <Input value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tone</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["formal", "urgent", "reassuring", "neutral", "technical"] as Tone[]).map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="English">English</SelectItem>
                    <SelectItem value="Hindi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Detail level</Label>
                <Select value={detailLevel} onValueChange={(v) => setDetailLevel(v as DetailLevel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["brief", "standard", "detailed"] as DetailLevel[]).map((d) => (
                      <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Objective</Label>
                <Select value={objective} onValueChange={(v) => setObjective(v as Objective)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["inform", "warn", "advise", "reassure", "instruct"] as Objective[]).map((o) => (
                      <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Content style</Label>
              <Input value={contentStyle} onChange={(e) => setContentStyle(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>3. Select output formats</CardTitle>
          <CardDescription>
            One source, generated into every format you pick, concurrently.
            {backendAvailable && " Only Advisory and LinkedIn Post are wired to a real generator so far — the rest are mock-only."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {ALL_FORMATS.map((f) => {
              const unsupportedLive = !!backendAvailable && !BACKEND_SUPPORTED_FORMATS.includes(f);
              return (
                <label
                  key={f}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    unsupportedLive ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                  } ${selectedFormats.includes(f) ? "border-primary bg-primary/5" : "border-input"}`}
                  title={unsupportedLive ? "No real generator for this format yet" : undefined}
                >
                  <Checkbox
                    checked={selectedFormats.includes(f)}
                    disabled={unsupportedLive}
                    onCheckedChange={() => !unsupportedLive && toggleFormat(f)}
                  />
                  {FORMAT_LABELS[f]}
                  {unsupportedLive && <span className="text-[10px] text-muted-foreground">(not built)</span>}
                </label>
              );
            })}
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedFormats.length} format{selectedFormats.length === 1 ? "" : "s"} selected
            </p>
            <Button onClick={handleSubmit} disabled={submitting || !hasContent || selectedFormats.length === 0}>
              {submitting ? "Running…" : "Run pipeline"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          {submitError && <p className="mt-2 text-sm text-red-600">{submitError}</p>}
        </CardContent>
      </Card>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Recent jobs</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions yet — run the pipeline above to see it work.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const sub = submissions.find((s) => s.id === job.submissionId);
              return (
                <button
                  key={job.id}
                  onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                  className="flex w-full items-center justify-between rounded-md border bg-white px-4 py-3 text-left hover:bg-accent"
                >
                  <div>
                    <div className="text-sm font-medium">{sub?.rawExcerpt.slice(0, 90) ?? job.id}…</div>
                    <div className="text-xs text-muted-foreground">
                      {job.requestedFormats.map((f) => FORMAT_LABELS[f]).join(", ")} · {new Date(job.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <Badge variant={stageColor[job.stage]} className="capitalize">
                    {job.stage}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
