import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type HcisButtonVariant = "primary" | "secondary" | "destructive";

interface HcisButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: HcisButtonVariant;
}

const variantClass: Record<HcisButtonVariant, string> = {
  primary: "bg-brand-primary text-white shadow-[var(--shadow-button)] hover:bg-brand-primary-deep",
  secondary: "border border-border bg-white text-foreground hover:bg-muted/50",
  destructive: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

export function HcisButton({
  children,
  className,
  type = "button",
  variant = "primary",
  ...props
}: HcisButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        variantClass[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
