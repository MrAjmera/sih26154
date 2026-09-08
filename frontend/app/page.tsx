"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { user } = useStore();
  const router = useRouter();

  useEffect(() => {
    router.replace(user ? "/dashboard" : "/login");
  }, [user, router]);

  return (
    <main className="flex min-h-[80vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </main>
  );
}
