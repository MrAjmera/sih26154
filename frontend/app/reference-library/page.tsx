"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORMAT_LABELS, FormatType } from "@/lib/types";
import { BookOpen, Plus } from "lucide-react";

export default function ReferenceLibraryPage() {
  const { user, referenceLibrary, addReferenceDocument } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [formatType, setFormatType] = useState<FormatType>("advisory");

  if (!user) return null;

  const handleAdd = () => {
    if (!title.trim() || !content.trim()) return;
    addReferenceDocument({ title, content, formatType });
    setTitle("");
    setContent("");
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Reference Library</h1>
          <p className="text-muted-foreground">
            Style-consistency RAG: past communications retrieved as style references before each generation, so
            outputs match your organization&rsquo;s own voice.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Seeded examples</CardTitle>
            <CardDescription>Synthetic house-style samples for this demo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {referenceLibrary.map((doc) => (
              <div key={doc.id} className="rounded-md border p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium">{doc.title}</span>
                  <Badge variant="outline">{FORMAT_LABELS[doc.formatType]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{doc.content.slice(0, 220)}…</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a house-style example</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 Advisory Template" />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={formatType} onValueChange={(v) => setFormatType(v as FormatType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FORMAT_LABELS) as FormatType[]).map((f) => (
                    <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} />
            </div>
            <Button className="w-full" onClick={handleAdd}>
              <Plus className="h-4 w-4" /> Add to library
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
