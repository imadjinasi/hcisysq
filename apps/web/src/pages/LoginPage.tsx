import { LoginForm } from "@/components/hcis/LoginForm";
import { AuthLayout } from "@/layouts/AuthLayout";

export function LoginPage() {
  return (
    <AuthLayout>
      <header className="mb-7 sm:mb-8">
        <span className="mb-4 block h-1 w-12 rounded-full bg-brand-yellow" aria-hidden="true" />
        <h2 className="font-display text-3xl font-bold leading-[1.08] tracking-[-0.018em] text-brand-heading sm:text-[2.15rem]">
          Selamat datang kembali
        </h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Masuk untuk membuka layanan kepegawaian sesuai kewenangan akun Anda.
        </p>
      </header>
      <LoginForm />
    </AuthLayout>
  );
}
