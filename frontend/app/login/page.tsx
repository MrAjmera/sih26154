"use client";

import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Role } from "@/lib/types";
import { ShieldCheck, PenLine, Eye, KeySquare } from "lucide-react";

const ROLE_INFO: { role: Role; title: string; desc: string; icon: React.ReactNode }[] = [
  {
    role: "operator",
    title: "Operator",
    desc: "Submits source content, sets generation parameters, and requests output formats.",
    icon: <PenLine className="h-5 w-5" />,
  },
  {
    role: "approver",
    title: "Approver",
    desc: "Reviews drafted outputs, checks confidence scores & grounding flags, approves or publishes.",
    icon: <Eye className="h-5 w-5" />,
  },
  {
    role: "admin",
    title: "Admin",
    desc: "Full access, plus the audit log across every submission, generation, and approval action.",
    icon: <KeySquare className="h-5 w-5" />,
  },
];

export default function LoginPage() {
  const { login } = useStore();
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-[85vh] max-w-4xl flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">SIH26154 — GenAI Content Transformation Platform</h1>
        </div>
        <p className="text-muted-foreground">
          Smart India Hackathon 2026 · NTRO · Blockchain &amp; Cybersecurity theme
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Demo sign-in — pick a role to see that part of the workflow. Real deployments use email/password + RBAC.
        </p>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-3">
        {ROLE_INFO.map((r) => (
          <Card key={r.role} className="flex flex-col">
            <CardHeader>
              <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                {r.icon}
              </div>
              <CardTitle>{r.title}</CardTitle>
              <CardDescription>{r.desc}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button
                className="w-full"
                onClick={() => {
                  login(r.role);
                  router.push("/dashboard");
                }}
              >
                Continue as {r.title}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
