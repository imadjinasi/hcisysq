import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { HcisDivider } from "@/components/hcis/HcisDivider";
import { HcisFormField } from "@/components/hcis/HcisFormField";
import { HcisPasswordInput } from "@/components/hcis/HcisPasswordInput";
import { GoogleIcon } from "@/components/hcis/icons/GoogleIcon";
import type { LoginCredentials } from "@/types/hcis";

type FormErrors = Partial<Record<keyof LoginCredentials, string>>;

function validate(data: LoginCredentials): FormErrors {
  const errors: FormErrors = {};
  if (!data.email.trim()) errors.email = "Email wajib diisi.";
  if (!data.password) errors.password = "Kata sandi wajib diisi.";
  return errors;
}

export function LoginForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState<LoginCredentials>({ email: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [googleNotice, setGoogleNotice] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsLoading(true);
    window.setTimeout(() => {
      void navigate({ to: "/app" });
    }, 500);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <HcisFormField
        id="email"
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="nama@yayasan.sq"
        value={form.email}
        onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
        error={errors.email}
      />

      <div className="space-y-1.5">
        <HcisPasswordInput
          id="password"
          label="Kata sandi"
          name="password"
          autoComplete="current-password"
          placeholder="Masukkan kata sandi"
          value={form.password}
          onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))}
          error={errors.password}
        />
        <div className="flex justify-end">
          <button type="button" className="rounded-md px-1 py-0.5 text-xs font-semibold text-brand-primary-deep hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30">
            Lupa kata sandi?
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        aria-busy={isLoading}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary text-sm font-bold text-white shadow-[var(--shadow-button)] transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-brand-primary-deep hover:shadow-[var(--shadow-raised)] active:translate-y-0 active:shadow-[var(--shadow-pressed)] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/35"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Membuka ruang kerja...
          </>
        ) : (
          "Masuk"
        )}
      </button>

      <HcisDivider text="atau" />

      <button
        type="button"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/80 bg-surface-raised text-sm font-semibold text-foreground shadow-[var(--shadow-input)] transition-[transform,box-shadow,background-color,border-color] hover:-translate-y-0.5 hover:border-brand-primary/25 hover:bg-white hover:shadow-[var(--shadow-raised)] active:translate-y-0 active:shadow-[var(--shadow-pressed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"
        onClick={() => setGoogleNotice(true)}
      >
        <GoogleIcon className="h-4 w-4" />
        Masuk dengan Google
      </button>

      {googleNotice && (
        <p className="rounded-lg bg-brand-primary-pale/60 px-3 py-2 text-center text-xs text-brand-primary-deep" role="status">
          Masuk dengan Google masih berupa tampilan. Integrasi autentikasi akan dikerjakan terpisah.
        </p>
      )}
    </form>
  );
}
