"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ShieldOff } from "lucide-react";

export default function AuditLogPage() {
  const { user, auditLog } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  if (!user) return null;

  if (user.role !== "admin") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <ShieldOff className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Admin access required</h1>
        <p className="text-muted-foreground">
          The audit log is restricted to the admin role. Log in as Admin from the login screen to view it.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground">Every submission, generation, approval, and publish action — actor and timestamp.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{auditLog.length} entries</CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {auditLog.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="whitespace-nowrap">{entry.action}</Badge>
                  <span className="text-muted-foreground">
                    {entry.entityType} · {entry.entityId}
                  </span>
                </div>
                <div className="whitespace-nowrap text-right text-xs text-muted-foreground">
                  <div>{entry.userName}</div>
                  <div>{new Date(entry.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {auditLog.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No actions recorded yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
