import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { logout } from "@/lib/auth";

export function FoundationBoardPage() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      await navigate({ to: "/" });
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8f7] p-6">
      <section className="w-full max-w-2xl rounded-3xl border border-border/70 bg-white p-8 shadow-[var(--shadow-raised)]">
        <p className="text-xs font-semibold leading-5 text-muted-foreground">
          Human Capital Information System · Yayasan Sabilul Qur&apos;an
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-[-0.015em] text-brand-heading">Foundation Board</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Area governance akan dibangun pada tahap berikutnya. Sesi tetap dipisahkan dari akses employee dan Super Admin.
        </p>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Keluar
        </button>
      </section>
    </main>
  );
}
