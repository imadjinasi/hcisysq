import type { ReactNode } from "react";

import { HcisAuthFooter } from "@/components/hcis/HcisAuthFooter";
import { HcisBrandPanel } from "@/components/hcis/HcisBrandPanel";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[56fr_44fr]">
      <HcisBrandPanel className="min-h-[17rem] lg:min-h-screen" />
      <main className="relative flex min-h-[calc(100vh-17rem)] flex-col justify-center overflow-hidden bg-surface px-5 py-10 sm:px-10 lg:min-h-screen lg:px-14 xl:px-20">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 top-12 h-44 w-44 rounded-full bg-brand-yellow/12 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-10 left-8 h-36 w-36 rounded-full bg-brand-cyan/10 blur-3xl" />
        <div className="relative z-10 mx-auto w-full max-w-[29rem]">
          {children}
          <HcisAuthFooter />
        </div>
      </main>
    </div>
  );
}
