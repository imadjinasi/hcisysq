import { createHash } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";

import type { ApiConfig } from "../../../config/env.js";
import {
  ADMS_MAX_BODY_BYTES,
  attlogAcknowledgementBody,
  extractAttlogStamp,
  extractSerialCandidate,
  getRequestIdleAcknowledgementBody,
  optionsAllHandshakeBody,
  parseDeviceCommandResultText,
  type AttlogQuarantine,
  type ParsedDeviceCommandResult,
} from "./protocol.js";
import { projectAdmsRequest } from "./projection.js";
import { getAdmsAttlogTransferStamp, persistAdmsIngress } from "./repository.js";
import { observeDetectedAdmsDevice } from "./wave1.js";

function directHostname(hostHeader: string | undefined): string | null {
  if (!hostHeader || hostHeader.includes(",")) return null;
  try {
    return new URL(`http://${hostHeader.trim()}`).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function safeHeader(value: string | string[] | undefined, max = 512) {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return null;
  const compact = Array.from(first, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f ? " " : character;
  })
    .join("")
    .trim();
  return compact ? compact.slice(0, max) : null;
}

function sourceIp(request: FastifyRequest) {
  const forwarded = safeHeader(request.headers["x-forwarded-for"]);
  const candidate = forwarded?.split(",")[0]?.trim() ?? request.ip ?? null;
  return candidate && /^[0-9A-Fa-f:.]{1,45}$/.test(candidate) ? candidate : null;
}

function acceptsUtf8(contentType: string | null, contentEncoding: string | null) {
  if (contentEncoding && !/^identity$/i.test(contentEncoding.trim())) return false;
  if (!contentType) return true;
  const charset = /charset\s*=\s*([^;\s]+)/i.exec(contentType)?.[1]?.replace(/["']/g, "");
  return !charset || /^utf-?8$/i.test(charset);
}

type CapturedBody = {
  body: Buffer | null;
  bodySha256: string;
  bodyByteLength: number;
  bodyCaptured: boolean;
};

function asCapturedBody(value: unknown): CapturedBody {
  if (
    value &&
    typeof value === "object" &&
    "bodyByteLength" in value &&
    "bodyCaptured" in value &&
    "bodySha256" in value
  ) {
    return value as CapturedBody;
  }
  return {
    body: Buffer.alloc(0),
    bodySha256: createHash("sha256").update(Buffer.alloc(0)).digest("hex"),
    bodyByteLength: 0,
    bodyCaptured: true,
  };
}

export async function registerAdmsIngressRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: ApiConfig,
) {
  await app.register(async (adms) => {
    adms.removeAllContentTypeParsers();
    adms.addContentTypeParser("*", (_request, payload, done) => {
      const hash = createHash("sha256");
      const chunks: Buffer[] = [];
      let length = 0;
      let captured = true;

      payload.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += buffer.length;
        hash.update(buffer);
        if (length <= ADMS_MAX_BODY_BYTES) chunks.push(buffer);
        else captured = false;
      });
      payload.on("end", () => {
        done(null, {
          body: captured ? Buffer.concat(chunks, length) : null,
          bodySha256: hash.digest("hex"),
          bodyByteLength: length,
          bodyCaptured: captured,
        } satisfies CapturedBody);
      });
      payload.on("error", done);
    });

    adms.all("/iclock/*", async (request, reply) => {
      const expectedHost = config.ADMS_INGRESS_HOST?.toLowerCase().replace(/\.$/, "");
      if (!expectedHost || directHostname(request.headers.host) !== expectedHost) {
        return reply.status(404).send();
      }

      const url = new URL(request.raw.url ?? "/", `http://${request.headers.host}`);
      const receivedAt = new Date();
      const contentType = safeHeader(request.headers["content-type"]);
      const contentEncoding = safeHeader(request.headers["content-encoding"]);
      const capture = asCapturedBody(request.body);
      const safeMetadata: Record<string, string> = {};
      const userAgent = safeHeader(request.headers["user-agent"]);
      const accept = safeHeader(request.headers.accept);
      if (userAgent) safeMetadata.userAgent = userAgent;
      if (accept) safeMetadata.accept = accept;
      if (contentEncoding) safeMetadata.contentEncoding = contentEncoding;
      for (const key of ["pushver", "PushVersion", "language"]) {
        const value = url.searchParams.get(key);
        if (value && value.length <= 128) safeMetadata[key] = value;
      }

      const quarantines: AttlogQuarantine[] = [];
      const commandResults: ParsedDeviceCommandResult[] = [];
      let attlogText: string | null = null;
      let classification = "protocol_discovery";
      if (capture.body && capture.body.length > 0) {
        if (!acceptsUtf8(contentType, contentEncoding)) {
          classification = "unsupported_encoding";
          quarantines.push({ reason: "UNSUPPORTED_ENCODING", rawLine: "", details: {} });
        } else {
          try {
            const text = new TextDecoder("utf-8", { fatal: true }).decode(capture.body);
            if (request.method === "POST" && url.pathname === "/iclock/devicecmd") {
              classification = "device_command_result";
              const parsed = parseDeviceCommandResultText(text);
              commandResults.push(...parsed.results);
              quarantines.push(...parsed.quarantines);
            } else if (text.includes("\t")) {
              classification = "attlog";
              attlogText = text;
            }
          } catch {
            classification = "unsupported_encoding";
            quarantines.push({ reason: "UNSUPPORTED_ENCODING", rawLine: "", details: {} });
          }
        }
      }

      const serialCandidate = extractSerialCandidate(url);
      const requestSourceIp = sourceIp(request);
      await observeDetectedAdmsDevice(pool, {
        serialNumber: serialCandidate,
        sourceIp: requestSourceIp,
        receivedAt,
        safeMetadata,
      });

      const attlogStamp = extractAttlogStamp(url);
      const configuredAttlogStamp = serialCandidate
        ? await getAdmsAttlogTransferStamp(pool, serialCandidate)
        : null;
      const successResponseBody =
        request.method === "GET"
          ? optionsAllHandshakeBody(url, serialCandidate, configuredAttlogStamp ?? "None") ??
            getRequestIdleAcknowledgementBody(url)
          : url.pathname === "/iclock/devicecmd"
            ? "OK"
            : attlogText
              ? attlogAcknowledgementBody(attlogText)
              : null;

      const result = await persistAdmsIngress(pool, {
        receivedAt,
        method: request.method,
        path: url.pathname,
        rawQuery: url.search,
        contentType,
        sourceIp: requestSourceIp,
        safeMetadata,
        serialCandidate,
        body: capture.body,
        bodySha256: capture.bodySha256,
        bodyByteLength: capture.bodyByteLength,
        bodyCaptured: capture.bodyCaptured,
        classification,
        attlogText,
        attlogStamp,
        commandResults,
        quarantines,
        successResponseBody,
      });

      const projectionRequestIds = new Set(result.recoveredRequestIds);
      if (result.accepted && result.insertedEvents > 0) projectionRequestIds.add(result.requestId);
      for (const projectionRequestId of projectionRequestIds) {
        try {
          await projectAdmsRequest(pool, projectionRequestId);
        } catch (error) {
          request.log.error(
            { err: error, requestId: projectionRequestId, deviceId: result.deviceId },
            "ADMS attendance projection failed after durable capture/recovery",
          );
        }
      }

      reply.header("cache-control", "no-store");
      reply.header("x-content-type-options", "nosniff");
      if (result.responseBody !== null) reply.type("text/plain; charset=utf-8");
      return reply.status(result.responseStatus).send(result.responseBody ?? undefined);
    });
  });
}
