import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

export async function observeDetectedAdmsDevice(
  pool: Pool,
  input: {
    serialNumber: string | null;
    sourceIp: string | null;
    receivedAt: Date;
    safeMetadata: Record<string, string>;
  },
) {
  if (!input.serialNumber) return;
  await pool.query(
    `INSERT INTO attendance_adms_detected_devices (
       id, serial_number, first_seen_at, last_seen_at, last_ip, safe_metadata
     )
     SELECT $1, $2, $3, $3, $4, $5::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM attendance_adms_devices WHERE serial_number = $2
     )
     ON CONFLICT (serial_number) DO UPDATE
     SET last_seen_at = GREATEST(attendance_adms_detected_devices.last_seen_at, EXCLUDED.last_seen_at),
         last_ip = EXCLUDED.last_ip,
         observed_count = attendance_adms_detected_devices.observed_count + 1,
         safe_metadata = attendance_adms_detected_devices.safe_metadata || EXCLUDED.safe_metadata,
         updated_at = now()
     WHERE attendance_adms_detected_devices.status = 'detected'`,
    [
      randomUUID(),
      input.serialNumber,
      input.receivedAt,
      input.sourceIp,
      JSON.stringify(input.safeMetadata),
    ],
  );
}
