import { LoginForm } from "@/components/hcis/LoginForm";
import { AuthLayout } from "@/layouts/AuthLayout";

export function LoginPage() {
  return (
    <AuthLayout>
      <header className="mb-8 sm:mb-9">
        <span className="mb-5 block h-1 w-14 rounded-full bg-brand-yellow" aria-hidden="true" />
        <h2 className="font-display text-4xl font-bold leading-[1.06] tracking-[-0.02em] text-brand-heading sm:text-[2.6rem]">
          Selamat datang kembali
        </h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
          Masuk untuk mengakses layanan kepegawaian, kehadiran, dan persetujuan Anda.
        </p>
      </header>
      <LoginForm />
    </AuthLayout>
  );
}
