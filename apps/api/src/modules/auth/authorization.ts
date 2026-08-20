import {
  AUTH_COOKIE_NAME,
  AuthError,
  readCookie,
  type AuthPrincipal,
  type AuthService,
  type PrincipalType,
} from "./service.js";

export async function requirePrincipalFromCookie(
  auth: Pick<AuthService, "getSession">,
  cookieHeader: string | undefined,
  expected: PrincipalType,
): Promise<AuthPrincipal> {
  const token = readCookie(cookieHeader, AUTH_COOKIE_NAME);
  const session = await auth.getSession(token);

  if (!session) {
    throw new AuthError(401, "UNAUTHENTICATED", "Sesi tidak ditemukan atau sudah berakhir.");
  }

  if (session.principal.principalType !== expected) {
    throw new AuthError(403, "FORBIDDEN", "Akun ini tidak memiliki akses ke area tersebut.");
  }

  return session.principal;
}
