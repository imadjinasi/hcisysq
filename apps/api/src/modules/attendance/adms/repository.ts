import { createHash, randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";

import type { Pool, PoolClient } from "pg";

import {
  ADMS_MAX_BODY_BYTES,
  attlogEventIdentity,
  deviceCommandWireBody,
  extractAttlogStamp,
  parseAttlogText,
  type AttlogQuarantine,
  type ParsedAttlogEvent,
  type ParsedDeviceCommandResult,
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
  commandResults: ParsedDeviceCommandResult[];
  quarantines: AttlogQuarantine[];
  successResponseBody: string | null;
};

export type AdmsIngressResult = {
  requestId: string;
  deviceId: string | null;
  lifecycle: string | null;
  insertedEvents: number;
  duplicateEvents: number;
  recoveredEvents: number;
  recoveredRequestIds: string[];
  deliveredCommandNumber: string | null;
  commandResultsApplied: number;
  accepted: boolean;
  responseStatus: number;
  responseBody: string | null;
};

type DeviceRow = {
  id: string;
  serialNumber: string;
  lifecycle: "active" | "disabled" | "quarantined";
  timezone: string;
  createdAt: Date;
  preRegistrationRecoveryCompletedAt: Date | null;
};

type CommandRow = {
  id: string;
  commandNumber: string;
  wireCommand: string;
  status: string;
  attemptCount: number;
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
       timezone,
       created_at AS "createdAt",
       pre_registration_recovery_completed_at AS "preRegistrationRecoveryCompletedAt"
     FROM attendance_adms_devices
     WHERE serial_number = $1
     FOR UPDATE`,
    [serialCandidate],
  );
  return result.rows[0] ?? null;
}

async function insertEvent(
  client: PoolClient,
  device: DeviceRow,
  requestId: string,
  event: ParsedAttlogEvent,
  receivedAt: Date,
) {
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
      receivedAt,
    ],
  );
  return { inserted: Boolean(inserted.rowCount), identity };
}

async function writeQuarantine(
  client: PoolClient,
  requestId: string,
  deviceId: string | null,
  quarantine: {
    reason: string;
    rawLine: string | null;
    details: Record<string, string | number | boolean>;
  },
) {
  await client.query(
    `INSERT INTO attendance_adms_quarantines (
       id, request_id, device_id, reason, raw_line, details
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      randomUUID(),
      requestId,
      deviceId,
      quarantine.reason,
      quarantine.rawLine,
      JSON.stringify(quarantine.details),
    ],
  );
}

async function recoverPreRegistrationAttlog(
  client: PoolClient,
  device: DeviceRow,
  completedAt: Date,
) {
  if (device.preRegistrationRecoveryCompletedAt) {
    return { insertedEvents: 0, duplicateEvents: 0, requestIds: [] as string[] };
  }

  const historical = await client.query<{
    id: string;
    rawQuery: string;
    body: Buffer;
    receivedAt: Date;
  }>(
    `SELECT
       id,
       raw_query AS "rawQuery",
       body,
       received_at AS "receivedAt"
     FROM attendance_adms_request_journal
     WHERE device_id IS NULL
       AND serial_candidate_hash = $1
       AND classification = 'attlog'
       AND body_captured = true
       AND body IS NOT NULL
       AND response_status = 200
       AND received_at < $2
     ORDER BY received_at, id
     FOR SHARE`,
    [serialHash(device.serialNumber), device.createdAt],
  );

  let insertedEvents = 0;
  let duplicateEvents = 0;
  const requestIds = new Set<string>();
  let latestCursor: { stamp: string; requestId: string; receivedAt: Date } | null = null;

  for (const request of historical.rows) {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(request.body);
    } catch {
      await writeQuarantine(client, request.id, device.id, {
        reason: "RECOVERY_UNSUPPORTED_ENCODING",
        rawLine: null,
        details: { phase: "pre_registration_recovery" },
      });
      continue;
    }

    const parsed = parseAttlogText(text, device.timezone, request.receivedAt);
    for (const quarantine of parsed.quarantines) {
      await writeQuarantine(client, request.id, device.id, {
        reason: `RECOVERY_${quarantine.reason}`,
        rawLine: quarantine.rawLine,
        details: quarantine.details,
      });
    }

    for (const event of parsed.events) {
      const outcome = await insertEvent(client, device, request.id, event, request.receivedAt);
      if (outcome.inserted) {
        insertedEvents += 1;
        requestIds.add(request.id);
      } else {
        duplicateEvents += 1;
      }
    }

    if (parsed.events.length > 0) {
      const stamp = extractAttlogStamp(
        new URL(`/iclock/cdata${request.rawQuery}`, "http://adms-recovery.invalid"),
      );
      if (stamp) latestCursor = { stamp, requestId: request.id, receivedAt: request.receivedAt };
    }
  }

  if (latestCursor) {
    await client.query(
      `INSERT INTO attendance_adms_cursors (
         device_id, attlog_stamp, source_request_id, updated_at
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (device_id) DO UPDATE
       SET attlog_stamp = EXCLUDED.attlog_stamp,
           source_request_id = EXCLUDED.source_request_id,
           updated_at = EXCLUDED.updated_at
       WHERE attendance_adms_cursors.updated_at <= EXCLUDED.updated_at`,
      [device.id, latestCursor.stamp, latestCursor.requestId, latestCursor.receivedAt],
    );
  }

  await client.query(
    `UPDATE attendance_adms_devices
     SET pre_registration_recovery_completed_at = $2,
         updated_at = GREATEST(updated_at, $2)
     WHERE id = $1`,
    [device.id, completedAt],
  );

  const commandId = randomUUID();
  const queued = await client.query<{ id: string }>(
    `INSERT INTO attendance_adms_commands (
       id, device_id, command_type, wire_command, dedupe_key, reason, status
     ) VALUES ($1, $2, 'sync_new', 'LOG', $3, 'registration_recovery', 'pending')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [commandId, device.id, `registration_recovery:${device.id}`],
  );
  if (queued.rowCount) {
    await client.query(
      `INSERT INTO attendance_adms_command_events (
         id, command_id, event_type, metadata
       ) VALUES ($1, $2, 'queued', $3::jsonb)`,
      [randomUUID(), commandId, JSON.stringify({ reason: "registration_recovery" })],
    );
  }

  return { insertedEvents, duplicateEvents, requestIds: [...requestIds] };
}

async function takePendingCommand(
  client: PoolClient,
  deviceId: string,
  receivedAt: Date,
): Promise<CommandRow | null> {
  const result = await client.query<CommandRow>(
    `SELECT
       id,
       command_number::text AS "commandNumber",
       wire_command AS "wireCommand",
       status,
       attempt_count AS "attemptCount"
     FROM attendance_adms_commands
     WHERE device_id = $1
       AND command_type = 'sync_new'
       AND (
         status = 'pending'
         OR (
           status = 'delivered'
           AND delivered_at <= $2::timestamptz - interval '60 seconds'
           AND attempt_count < 3
         )
       )
     ORDER BY created_at, command_number
     FOR UPDATE SKIP LOCKED
     LIMIT 1`,
    [deviceId, receivedAt],
  );
  const command = result.rows[0];
  if (!command) return null;

  await client.query(
    `UPDATE attendance_adms_commands
     SET status = 'delivered',
         delivered_at = $2,
         attempt_count = attempt_count + 1,
         updated_at = $2
     WHERE id = $1`,
    [command.id, receivedAt],
  );
  return { ...command, status: "delivered", attemptCount: command.attemptCount + 1 };
}

async function applyCommandResult(
  client: PoolClient,
  deviceId: string,
  requestId: string,
  receivedAt: Date,
  result: ParsedDeviceCommandResult,
) {
  const found = await client.query<{
    id: string;
    status: string;
    returnCode: number | null;
    resultCommand: string | null;
  }>(
    `SELECT
       id,
       status,
       return_code AS "returnCode",
       result_command AS "resultCommand"
     FROM attendance_adms_commands
     WHERE device_id = $1
       AND command_number = $2::bigint
     FOR UPDATE`,
    [deviceId, result.commandNumber],
  );
  const command = found.rows[0];
  if (!command) {
    return {
      applied: false,
      quarantine: {
        reason: "UNKNOWN_COMMAND_RESULT",
        rawLine: result.rawLine,
        details: { commandNumber: result.commandNumber },
      },
    };
  }

  if (command.status === "succeeded" || command.status === "failed") {
    if (command.returnCode === result.returnCode && command.resultCommand === result.command) {
      return { applied: false, quarantine: null };
    }
    return {
      applied: false,
      quarantine: {
        reason: "COMMAND_RESULT_CONFLICT",
        rawLine: result.rawLine,
        details: { commandNumber: result.commandNumber },
      },
    };
  }

  const status = result.returnCode === -5000 ? "acknowledged" : result.returnCode >= 0 ? "succeeded" : "failed";
  const completed = status === "succeeded" || status === "failed";
  await client.query(
    `UPDATE attendance_adms_commands
     SET status = $2,
         acknowledged_at = COALESCE(acknowledged_at, $3),
         completed_at = CASE WHEN $4::boolean THEN $3 ELSE completed_at END,
         return_code = $5,
         result_command = $6,
         result_raw = $7,
         updated_at = $3
     WHERE id = $1`,
    [
      command.id,
      status,
      receivedAt,
      completed,
      result.returnCode,
      result.command,
      result.rawLine,
    ],
  );
  await client.query(
    `INSERT INTO attendance_adms_command_events (
       id, command_id, event_type, request_id, metadata
     ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      randomUUID(),
      command.id,
      status,
      requestId,
      JSON.stringify({ returnCode: result.returnCode, command: result.command }),
    ],
  );
  return { applied: true, quarantine: null };
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

    const recovery =
      device?.lifecycle === "active" && input.bodyCaptured
        ? await recoverPreRegistrationAttlog(client, device, input.receivedAt)
        : { insertedEvents: 0, duplicateEvents: 0, requestIds: [] as string[] };

    const requestId = randomUUID();
    let deliveredCommand: CommandRow | null = null;
    let responseBody = responseStatus === 200 ? input.successResponseBody : null;
    if (
      responseStatus === 200 &&
      device?.lifecycle === "active" &&
      input.method === "GET" &&
      input.path === "/iclock/getrequest"
    ) {
      deliveredCommand = await takePendingCommand(client, device.id, input.receivedAt);
      if (deliveredCommand) {
        responseBody = deviceCommandWireBody(
          deliveredCommand.commandNumber,
          deliveredCommand.wireCommand,
        );
      }
    }

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

    if (deliveredCommand) {
      await client.query(
        `INSERT INTO attendance_adms_command_events (
           id, command_id, event_type, request_id, metadata
         ) VALUES ($1, $2, 'delivered', $3, $4::jsonb)`,
        [
          randomUUID(),
          deliveredCommand.id,
          requestId,
          JSON.stringify({ attemptCount: deliveredCommand.attemptCount }),
        ],
      );
    }

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
        const outcome = await insertEvent(client, device, requestId, event, input.receivedAt);
        if (outcome.inserted) {
          insertedEvents += 1;
        } else {
          duplicateEvents += 1;
          quarantines.push({
            reason: "DUPLICATE_EXACT",
            rawLine: event.rawLine,
            details: { eventIdentityHash: outcome.identity },
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

    let commandResultsApplied = 0;
    if (device?.lifecycle === "active" && input.bodyCaptured) {
      for (const commandResult of input.commandResults) {
        const outcome = await applyCommandResult(
          client,
          device.id,
          requestId,
          input.receivedAt,
          commandResult,
        );
        if (outcome.applied) commandResultsApplied += 1;
        if (outcome.quarantine) quarantines.push(outcome.quarantine);
      }
    }

    for (const quarantine of quarantines) {
      await writeQuarantine(client, requestId, device?.id ?? null, quarantine);
    }

    await client.query("COMMIT");
    return {
      requestId,
      deviceId: device?.id ?? null,
      lifecycle: device?.lifecycle ?? null,
      insertedEvents,
      duplicateEvents,
      recoveredEvents: recovery.insertedEvents,
      recoveredRequestIds: recovery.requestIds,
      deliveredCommandNumber: deliveredCommand?.commandNumber ?? null,
      commandResultsApplied,
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
