import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

import type { ApiConfig } from "../../config/env.js";
import {
  AUTH_COOKIE_NAME,
  AuthError,
  AuthService,
  readCookie,
  type RequestContext,
} from "./service.js";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
  mfaCode: z.string().trim().min(1).max(64).optional(),
});

function requestContext(request: FastifyRequest): RequestContext {
  return {
    ipAddress: request.ip || null,
    userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null,
  };
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: ApiConfig,
) {
  if (!config.AUTH_ENCRYPTION_KEY) {
    throw new Error("AUTH_ENCRYPTION_KEY is required when the API auth routes are enabled");
  }

  const auth = new AuthService(
    pool,
    config.AUTH_ENCRYPTION_KEY,
    config.AUTH_SESSION_TTL_HOURS,
    config.NODE_ENV === "production",
  );

  app.post("/auth/login", async (request, reply) => {
    reply.header("Cache-Control", "no-store");

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: "INVALID_REQUEST",
        message: "Format email atau kredensial tidak valid.",
      });
    }

    try {
      const result = await auth.login(parsed.data, requestContext(request));
      reply.header("Set-Cookie", result.setCookie);
      return reply.send(result.session);
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  });

  app.get("/auth/me", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const token = readCookie(request.headers.cookie, AUTH_COOKIE_NAME);
    const session = await auth.getSession(token);

    if (!session) {
      return reply.status(401).send({
        code: "UNAUTHENTICATED",
        message: "Sesi tidak ditemukan atau sudah berakhir.",
      });
    }

    return reply.send(session);
  });

  app.post("/auth/logout", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const token = readCookie(request.headers.cookie, AUTH_COOKIE_NAME);
    await auth.logout(token, requestContext(request));
    reply.header("Set-Cookie", auth.clearSessionCookie());
    return reply.status(204).send();
  });
}
