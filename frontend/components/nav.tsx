"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, LogOut } from "lucide-react";

export function Nav() {
  const { user, logout } = useStore();
  const pathname = usePathname();
  const router = useRouter();

  if (!user) return null;

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/reference-library", label: "Reference Library" },
    ...(user.role === "admin" ? [{ href: "/audit-log", label: "Audit Log" }] : []),
  ];

  return (
    <header className="border-b bg-white sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span>SIH26154</span>
          <span className="hidden text-muted-foreground font-normal sm:inline">
            GenAI Content Transformation Platform
          </span>
        </div>
        <nav className="flex items-center gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              <Button variant={pathname?.startsWith(l.href) ? "secondary" : "ghost"} size="sm">
                {l.label}
              </Button>
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <div className="font-medium leading-tight">{user.name}</div>
            <Badge variant="outline" className="capitalize">
              {user.role}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              logout();
              router.push("/login");
            }}
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
