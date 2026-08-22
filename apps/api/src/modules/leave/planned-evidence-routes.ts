import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import type { ApiConfig } from "../../config/env.js";
import { requirePrincipalFromCookie } from "../auth/authorization.js";
import { encryptSecret } from "../auth/crypto.js";
import { AuthError, AuthService, type AuthPrincipal } from "../auth/service.js";
import { SUPPORTED_PLANNED_LEAVE_KEYS } from "./domain/planned-leave-policy.js";

const requestParamSchema = z.object({ requestId: z.string().uuid() });
const evidenceSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  contentBase64: z.string().min(1).max(3_000_000),
});

class PlannedEvidenceError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PlannedEvidenceError";
  }
}

function decodeEvidence(input: z.infer<typeof evidenceSchema>) {
  const bytes = Buffer.from(input.contentBase64, "base64");
  if (bytes.length === 0 || bytes.length > 2_097_152) {
    throw new PlannedEvidenceError(413, "EVIDENCE_TOO_LARGE", "Dokumen pendukung maksimal 2 MB per file.");
  }
  const signatureOk =
    (input.contentType === "application/pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-") ||
    (input.contentType === "image/jpeg" &&
      bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (input.contentType === "image/png" &&
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  if (!signatureOk) {
    throw new PlannedEvidenceError(400, "EVIDENCE_TYPE_MISMATCH", "Tipe file tidak sesuai dengan isi dokumen.");
  }
  return bytes;
}

async function storeEvidence(
  db: PoolClient,
  requestId: string,
  accountId: string,
  input: z.infer<typeof evidenceSchema>,
  encryptionKey: string,
) {
  const bytes = decodeEvidence(input);
  const encrypted = encryptSecret(bytes.toString("base64"), encryptionKey);
  const evidenceId = randomUUID();
  await db.query(
    `INSERT INTO leave_request_evidence (
      id, leave_request_id, original_filename, content_type, byte_size,
      ciphertext, iv, auth_tag, uploaded_by_account_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      evidenceId,
      requestId,
      input.fileName,
      input.contentType,
      bytes.length,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      accountId,
    ],
  );
  return { id: evidenceId, fileName: input.fileName, contentType: input.contentType, byteSize: bytes.length };
}

async function addEvent(
  db: PoolClient,
  requestId: string,
  principal: AuthPrincipal,
  evidenceId: string,
) {
  await db.query(
    `INSERT INTO leave_request_events (
      id, leave_request_id, actor_account_id, event_type, payload
    ) VALUES ($1, $2, $3, 'leave.evidence.added', $4::jsonb)`,
    [randomUUID(), requestId, principal.id, JSON.stringify({ evidenceId })],
  );
}

export async function registerPlannedEvidenceRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: ApiConfig,
) {
  if (!config.AUTH_ENCRYPTION_KEY) {
    throw new Error("AUTH_ENCRYPTION_KEY is required for planned evidence routes");
  }
  const auth = new AuthService(
    pool,
    config.AUTH_ENCRYPTION_KEY,
    config.AUTH_SESSION_TTL_HOURS,
    config.NODE_ENV === "production",
  );

  async function authenticateEmployee(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthPrincipal | null> {
    try {
      return await requirePrincipalFromCookie(auth, request.headers.cookie, "EMPLOYEE");
    } catch (error) {
      if (error instanceof AuthError) {
        reply.header("Cache-Control", "no-store");
        await reply.status(error.statusCode).send({ code: error.code, message: error.message });
        return null;
      }
      throw error;
    }
  }

  app.post(
    "/leave/planned/me/requests/:requestId/evidence",
    { bodyLimit: 3_500_000 },
    async (request, reply) => {
      const principal = await authenticateEmployee(request, reply);
      if (!principal) return;
      const params = requestParamSchema.safeParse(request.params);
      const body = evidenceSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ code: "INVALID_EVIDENCE", message: "Dokumen pendukung tidak valid." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query<{
          requestId: string;
          status: string;
          evidenceRequirement: string;
        }>(
          `SELECT
            request.id AS "requestId",
            request.status,
            request.evidence_requirement AS "evidenceRequirement"
          FROM leave_requests request
          JOIN accounts account ON account.employee_id = request.employee_id
          WHERE request.id = $1
            AND account.id = $2
            AND account.principal_type = 'EMPLOYEE'
            AND account.status = 'active'
            AND request.policy_key = ANY($3::text[])
          FOR UPDATE OF request`,
          [params.data.requestId, principal.id, [...SUPPORTED_PLANNED_LEAVE_KEYS]],
        );
        const leaveRequest = result.rows[0];
        if (!leaveRequest) {
          throw new PlannedEvidenceError(404, "PLANNED_LEAVE_NOT_FOUND", "Pengajuan tidak ditemukan.");
        }
        if (leaveRequest.status !== "in_review") {
          throw new PlannedEvidenceError(409, "EVIDENCE_UPLOAD_CLOSED", "Dokumen hanya dapat dilengkapi saat pengajuan masih diproses.");
        }
        if (leaveRequest.evidenceRequirement !== "required") {
          throw new PlannedEvidenceError(409, "EVIDENCE_NOT_REQUIRED", "Jenis cuti ini tidak memerlukan dokumen pendukung.");
        }

        const evidence = await storeEvidence(
          client,
          leaveRequest.requestId,
          principal.id,
          body.data,
          config.AUTH_ENCRYPTION_KEY,
        );
        await client.query(
          `UPDATE leave_request_hc_tasks
           SET status = CASE WHEN status = 'needs_correction' THEN 'pending' ELSE status END,
               updated_at = now()
           WHERE leave_request_id = $1 AND task_kind = 'validate'`,
          [leaveRequest.requestId],
        );
        await addEvent(client, leaveRequest.requestId, principal, evidence.id);
        await client.query(
          `INSERT INTO leave_notification_outbox (
            id, leave_request_id, event_type, target_type, target_key, payload
          ) VALUES ($1, $2, 'leave.evidence.added.hc_notify', 'role', 'human_capital', '{}'::jsonb)`,
          [randomUUID(), leaveRequest.requestId],
        );
        await client.query("COMMIT");
        return reply.status(201).send(evidence);
      } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof PlannedEvidenceError) {
          return reply.status(error.statusCode).send({ code: error.code, message: error.message });
        }
        throw error;
      } finally {
        client.release();
      }
    },
  );
}
