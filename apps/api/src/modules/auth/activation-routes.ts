import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

import {
  AccountActivationError,
  AccountActivationService,
  ACCOUNT_ACTIVATION_PASSWORD_MAX_LENGTH,
  ACCOUNT_ACTIVATION_PASSWORD_MIN_LENGTH,
} from "./account-activation.js";
import type { RequestContext } from "./service.js";

const tokenParamsSchema = z.object({
  token: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

const activationBodySchema = z.object({
  password: z
    .string()
    .min(ACCOUNT_ACTIVATION_PASSWORD_MIN_LENGTH)
    .max(ACCOUNT_ACTIVATION_PASSWORD_MAX_LENGTH),
});

function requestContext(request: FastifyRequest): RequestContext {
  return {
    ipAddress: request.ip || null,
    userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null,
  };
}

async function sendActivationError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof AccountActivationError)) throw error;
  return reply.status(error.statusCode).send({ code: error.code, message: error.message });
}

export async function registerAccountActivationRoutes(app: FastifyInstance, pool: Pool) {
  const activation = new AccountActivationService(pool);

  app.get("/auth/activation/:token", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const params = tokenParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(410).send({
        code: "ACTIVATION_LINK_INVALID",
        message: "Link aktivasi tidak berlaku atau sudah kedaluwarsa. Minta link aktivasi baru kepada administrator.",
      });
    }

    try {
      return reply.send(await activation.preview(params.data.token));
    } catch (error) {
      return sendActivationError(reply, error);
    }
  });

  app.post("/auth/activation/:token", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const params = tokenParamsSchema.safeParse(request.params);
    const body = activationBodySchema.safeParse(request.body);
    if (!params.success) {
      return reply.status(410).send({
        code: "ACTIVATION_LINK_INVALID",
        message: "Link aktivasi tidak berlaku atau sudah kedaluwarsa. Minta link aktivasi baru kepada administrator.",
      });
    }
    if (!body.success) {
      return reply.status(400).send({
        code: "INVALID_ACTIVATION_PASSWORD",
        message: `Kata sandi harus ${ACCOUNT_ACTIVATION_PASSWORD_MIN_LENGTH}-${ACCOUNT_ACTIVATION_PASSWORD_MAX_LENGTH} karakter.`,
      });
    }

    try {
      const result = await activation.activate(
        params.data.token,
        body.data.password,
        requestContext(request),
      );
      return reply.send({
        status: "active",
        principalType: result.principalType,
        message: "Account berhasil diaktifkan. Silakan masuk menggunakan email dan kata sandi Anda.",
      });
    } catch (error) {
      return sendActivationError(reply, error);
    }
  });
}
