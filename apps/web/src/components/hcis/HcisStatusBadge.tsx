import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatusTone = "pending" | "review" | "approved" | "warning" | "neutral";

const toneClasses: Record<StatusTone, string> = {
  pending: "border-brand-yellow/45 bg-brand-yellow/15 text-amber-900",
  review: "border-brand-cyan/45 bg-brand-cyan/14 text-cyan-900",
  approved: "border-brand-primary/35 bg-brand-primary-pale text-brand-primary-deep",
  warning: "border-brand-orange/45 bg-brand-orange/15 text-orange-900",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function HcisStatusBadge({ children, tone = "neutral", className }: { children: ReactNode; tone?: StatusTone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none", toneClasses[tone], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {children}
    </span>
  );
}
