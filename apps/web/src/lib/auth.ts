import type { AuthSession, LoginCredentials, PrincipalType } from "@/types/hcis";

interface ErrorPayload {
  code?: string;
  message?: string;
}

export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

async function readError(response: Response): Promise<AuthApiError> {
  let payload: ErrorPayload = {};
  try {
    payload = (await response.json()) as ErrorPayload;
  } catch {
    // The fallback below is intentionally generic.
  }

  return new AuthApiError(
    response.status,
    payload.code ?? "AUTH_REQUEST_FAILED",
    payload.message ?? "Permintaan autentikasi gagal.",
  );
}

export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) throw await readError(response);
  return (await response.json()) as AuthSession;
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (response.status === 401) return null;
    if (!response.ok) return null;
    return (await response.json()) as AuthSession;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { Accept: "application/json" },
  });
}

export function landingPath(
  principalType: PrincipalType,
): "/app" | "/admin" | "/board" {
  if (principalType === "SUPER_ADMIN") return "/admin";
  if (principalType === "FOUNDATION_BOARD") return "/board";
  return "/app";
}
