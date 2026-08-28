import { createHash, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import {
  ADMS_MAX_BODY_BYTES,
  attlogEventIdentity,
  parseAttlogText,
  type AttlogQuarantine,
  type ParsedAttlogEvent,
} from "./protocol.js";

export type AdmsIngressInput = {
  receivedAt: Date;
  method: string;
  path: string;
  rawQuery: string;
  contentType: string | null;
  sourceIp: string | null;
  safeMetadata: Record<string, string>;
  serialCandidate: string | null;
  body: Buffer | null;
  bodySha256: string | null;
  bodyByteLength: number;
  bodyCaptured: boolean;
  classification: string;
  attlogText: string | null;
  attlogStamp: string | null;
  quarantines: AttlogQuarantine[];
  successResponseBody: string | null;
};

export type AdmsIngressResult = {
  requestId: string;
  deviceId: string | null;
  lifecycle: string | null;
  insertedEvents: number;
  duplicateEvents: number;
  accepted: boolean;
  responseStatus: number;
  responseBody: string | null;
};

type DeviceRow = {
  id: string;
  serialNumber: string;
  lifecycle: "active" | "disabled" | "quarantined";
  timezone: string;
};

function serialHash(serial: string | null) {
  return serial ? createHash("sha256").update(serial, "utf8").digest("hex") : null;
}

export async function getAdmsAttlogTransferStamp(
  db: Pool | PoolClient,
  serialNumber: string,
): Promise<string | null> {
  const result = await db.query<{ attlogStamp: string }>(
    `SELECT c.attlog_stamp AS "attlogStamp"
     FROM attendance_adms_devices d
     JOIN attendance_adms_cursors c ON c.device_id = d.id
     WHERE d.serial_number = $1
       AND d.lifecycle = 'active'
     LIMIT 1`,
    [serialNumber],
  );
  return result.rows[0]?.attlogStamp ?? null;
}

async function loadDeviceForUpdate(client: PoolClient, serialCandidate: string | null) {
  if (!serialCandidate) return null;
  const result = await client.query<DeviceRow>(
    `SELECT
       id,
       serial_number AS "serialNumber",
       lifecycle,
       timezone
     FROM attendance_adms_devices
     WHERE serial_number = $1
     FOR UPDATE`,
    [serialCandidate],
  );
  return result.rows[0] ?? null;
}

export async function persistAdmsIngress(
  db: Pool,
  input: AdmsIngressInput,
): Promise<AdmsIngressResult> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const device = await loadDeviceForUpdate(client, input.serialCandidate);
    const responseStatus = !input.bodyCaptured
      ? 413
      : device?.lifecycle === "disabled" || device?.lifecycle === "quarantined"
        ? 403
        : 200;
    const responseBody = responseStatus === 200 ? input.successResponseBody : null;
    const requestId = randomUUID();

    await client.query(
      `INSERT INTO attendance_adms_request_journal (
         id, device_id, serial_candidate_hash, method, path, raw_query,
         content_type, source_ip, safe_metadata, body, body_sha256,
         body_byte_length, body_captured, classification, response_status,
         response_body, received_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9::jsonb, $10, $11,
         $12, $13, $14, $15,
         $16, $17
       )`,
      [
        requestId,
        device?.id ?? null,
        serialHash(input.serialCandidate),
        input.method,
        input.path,
        input.rawQuery,
        input.contentType,
        input.sourceIp,
        JSON.stringify(input.safeMetadata),
        input.body,
        input.bodySha256,
        input.bodyByteLength,
        input.bodyCaptured,
        input.classification,
        responseStatus,
        responseBody,
        input.receivedAt,
      ],
    );

    if (device) {
      await client.query(
        `UPDATE attendance_adms_devices
         SET first_seen_at = COALESCE(first_seen_at, $2),
             last_seen_at = $2,
             last_ip = $3,
             last_successful_request_at = CASE
               WHEN $4::boolean AND lifecycle = 'active' THEN $2
               ELSE last_successful_request_at
             END,
             updated_at = $2
         WHERE id = $1`,
        [device.id, input.receivedAt, input.sourceIp, input.bodyCaptured],
      );
    }

    const parsed =
      device && input.attlogText
        ? parseAttlogText(input.attlogText, device.timezone, input.receivedAt)
        : { events: [] as ParsedAttlogEvent[], quarantines: [] as AttlogQuarantine[] };

    const quarantines: Array<{
      reason: string;
      rawLine: string | null;
      details: Record<string, string | number | boolean>;
    }> = [...input.quarantines, ...parsed.quarantines].map((entry) => ({ ...entry }));

    if (!input.bodyCaptured) {
      quarantines.push({
        reason: "PAYLOAD_TRUNCATED",
        rawLine: null,
        details: { maxBytes: ADMS_MAX_BODY_BYTES, receivedBytes: input.bodyByteLength },
      });
    }
    if (!device) {
      quarantines.push({ reason: "UNKNOWN_DEVICE", rawLine: null, details: {} });
    } else if (device.lifecycle !== "active") {
      quarantines.push({
        reason: "DEVICE_NOT_ALLOWED",
        rawLine: null,
        details: { lifecycle: device.lifecycle },
      });
    }

    let insertedEvents = 0;
    let duplicateEvents = 0;
    if (device?.lifecycle === "active" && input.bodyCaptured) {
      for (const event of parsed.events) {
        const identity = attlogEventIdentity(device.serialNumber, event);
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO attendance_adms_events (
             id, device_id, source_request_id, event_identity_hash, pin,
             occurred_at_raw, occurred_at, raw_line, raw_fields,
             raw_line_sha256, received_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
           ON CONFLICT (event_identity_hash) DO NOTHING
           RETURNING id`,
          [
            randomUUID(),
            device.id,
            requestId,
            identity,
            event.pin,
            event.occurredAtRaw,
            event.occurredAt,
            event.rawLine,
            JSON.stringify(event.rawFields),
            event.rawLineSha256,
            input.receivedAt,
          ],
        );
        if (inserted.rowCount) {
          insertedEvents += 1;
        } else {
          duplicateEvents += 1;
          quarantines.push({
            reason: "DUPLICATE_EXACT",
            rawLine: event.rawLine,
            details: { eventIdentityHash: identity },
          });
        }
      }
    }

    if (device?.lifecycle === "active" && input.bodyCaptured && input.attlogStamp) {
      await client.query(
        `INSERT INTO attendance_adms_cursors (
           device_id, attlog_stamp, source_request_id, updated_at
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (device_id) DO UPDATE
         SET attlog_stamp = EXCLUDED.attlog_stamp,
             source_request_id = EXCLUDED.source_request_id,
             updated_at = EXCLUDED.updated_at
         WHERE attendance_adms_cursors.updated_at <= EXCLUDED.updated_at`,
        [device.id, input.attlogStamp, requestId, input.receivedAt],
      );
    }

    for (const quarantine of quarantines) {
      await client.query(
        `INSERT INTO attendance_adms_quarantines (
           id, request_id, device_id, reason, raw_line, details
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          randomUUID(),
          requestId,
          device?.id ?? null,
          quarantine.reason,
          quarantine.rawLine,
          JSON.stringify(quarantine.details),
        ],
      );
    }

    await client.query("COMMIT");
    return {
      requestId,
      deviceId: device?.id ?? null,
      lifecycle: device?.lifecycle ?? null,
      insertedEvents,
      duplicateEvents,
      accepted: Boolean(device && device.lifecycle === "active" && input.bodyCaptured),
      responseStatus,
      responseBody,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
