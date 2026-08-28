import type { Pool } from "pg";

import type { SafeDeviceRosterRecord } from "./wave2-protocol.js";

export async function observeDeviceRosterEntries(
  pool: Pool,
  input: {
    deviceId: string;
    sourceRequestId: string;
    observedAt: Date;
    records: SafeDeviceRosterRecord[];
  },
) {
  if (input.records.length === 0) return 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let affected = 0;
    for (const record of input.records) {
      const result = await client.query(
        `INSERT INTO attendance_adms_device_roster_entries (
           id, device_id, pin, display_name, card_number, privilege, verify_mode,
           safe_metadata, source_request_id, first_seen_at, last_seen_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6,
           $7::jsonb, $8, $9, $9
         )
         ON CONFLICT (device_id, pin) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             card_number = EXCLUDED.card_number,
             privilege = EXCLUDED.privilege,
             verify_mode = EXCLUDED.verify_mode,
             safe_metadata = EXCLUDED.safe_metadata,
             source_request_id = EXCLUDED.source_request_id,
             first_seen_at = LEAST(attendance_adms_device_roster_entries.first_seen_at, EXCLUDED.first_seen_at),
             last_seen_at = GREATEST(attendance_adms_device_roster_entries.last_seen_at, EXCLUDED.last_seen_at),
             updated_at = now()`,
        [
          input.deviceId,
          record.pin,
          record.displayName,
          record.cardNumber,
          record.privilege,
          record.verifyMode,
          JSON.stringify(record.safeMetadata),
          input.sourceRequestId,
          input.observedAt,
        ],
      );
      affected += result.rowCount ?? 0;
    }
    await client.query("COMMIT");
    return affected;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
