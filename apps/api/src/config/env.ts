import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().min(1),
    ADMS_INGRESS_HOST: z.string().trim().min(1).optional(),
    AUTH_MODE: z.enum(["local", "oidc"]).default("local"),
    AUTH_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
    AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(8),
    OIDC_ISSUER: z.string().url().optional(),
    OIDC_CLIENT_ID: z.string().trim().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_REDIRECT_URI: z.string().url().optional(),
    OIDC_POST_LOGOUT_REDIRECT_URI: z.string().url().optional(),
    SQ_HUB_APPLICATION_ACCESS_URL: z.string().url().optional(),
    SQ_HUB_MACHINE_CLIENT_ID: z.string().trim().min(1).optional(),
    SQ_HUB_MACHINE_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.AUTH_MODE !== "oidc") return;

    if (value.AUTH_SESSION_TTL_HOURS > 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_SESSION_TTL_HOURS"],
        message: "OIDC HCIS session lifetime must not exceed the 12-hour SSO maximum",
      });
    }

    const required = [
      "OIDC_ISSUER",
      "OIDC_CLIENT_ID",
      "OIDC_CLIENT_SECRET",
      "OIDC_REDIRECT_URI",
      "OIDC_POST_LOGOUT_REDIRECT_URI",
      "SQ_HUB_APPLICATION_ACCESS_URL",
      "SQ_HUB_MACHINE_CLIENT_ID",
      "SQ_HUB_MACHINE_CLIENT_SECRET",
    ] as const;

    for (const key of required) {
      if (value[key]) continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when AUTH_MODE=oidc`,
      });
    }
  });

export type ApiConfig = z.infer<typeof envSchema>;

export interface OidcRuntimeConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  applicationAccessUrl: string;
  machineClientId: string;
  machineClientSecret: string;
}

export function getOidcRuntimeConfig(config: ApiConfig): OidcRuntimeConfig {
  if (
    config.AUTH_MODE !== "oidc" ||
    !config.OIDC_ISSUER ||
    !config.OIDC_CLIENT_ID ||
    !config.OIDC_CLIENT_SECRET ||
    !config.OIDC_REDIRECT_URI ||
    !config.OIDC_POST_LOGOUT_REDIRECT_URI ||
    !config.SQ_HUB_APPLICATION_ACCESS_URL ||
    !config.SQ_HUB_MACHINE_CLIENT_ID ||
    !config.SQ_HUB_MACHINE_CLIENT_SECRET
  ) {
    throw new Error("OIDC runtime configuration is incomplete");
  }

  return {
    issuer: config.OIDC_ISSUER.replace(/\/$/, ""),
    clientId: config.OIDC_CLIENT_ID,
    clientSecret: config.OIDC_CLIENT_SECRET,
    redirectUri: config.OIDC_REDIRECT_URI,
    postLogoutRedirectUri: config.OIDC_POST_LOGOUT_REDIRECT_URI,
    applicationAccessUrl: config.SQ_HUB_APPLICATION_ACCESS_URL,
    machineClientId: config.SQ_HUB_MACHINE_CLIENT_ID,
    machineClientSecret: config.SQ_HUB_MACHINE_CLIENT_SECRET,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return envSchema.parse(env);
}
