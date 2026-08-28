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

  const observedTransportMetadata = {
    ...input.safeMetadata,
    observedAt: input.receivedAt.toISOString(),
  };
  const registered = await pool.query(
    `UPDATE attendance_adms_devices
     SET metadata = jsonb_set(
           metadata,
           '{transportObserved}',
           COALESCE(metadata -> 'transportObserved', '{}'::jsonb) || $2::jsonb,
           true
         ),
         updated_at = GREATEST(updated_at, $3)
     WHERE serial_number = $1
     RETURNING id`,
    [
      input.serialNumber,
      JSON.stringify(observedTransportMetadata),
      input.receivedAt,
    ],
  );
  if (registered.rowCount) return;

  await pool.query(
    `INSERT INTO attendance_adms_detected_devices (
       id, serial_number, first_seen_at, last_seen_at, last_ip, safe_metadata
     ) VALUES ($1, $2, $3, $3, $4, $5::jsonb)
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
      JSON.stringify(observedTransportMetadata),
    ],
  );
}
