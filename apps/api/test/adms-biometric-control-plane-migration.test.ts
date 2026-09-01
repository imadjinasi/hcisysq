import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("0035 biometric control plane migration", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("adds versioned envelope maintenance metadata without weakening append-only audit", async () => {
    const columns = await pool.query<{ columnName: string; columnDefault: string | null }>(
      `SELECT column_name AS "columnName", column_default AS "columnDefault"
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'attendance_biometric_credentials'
         AND column_name IN ('envelope_version', 'last_reencrypted_at', 'last_reencrypted_by_account_id')
       ORDER BY column_name`,
    );
    expect(columns.rows.map((item) => item.columnName)).toEqual([
      "envelope_version",
      "last_reencrypted_at",
      "last_reencrypted_by_account_id",
    ]);
    expect(columns.rows.find((item) => item.columnName === "envelope_version")?.columnDefault).toContain("aes-256-gcm-v1");

    const actionConstraint = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'attendance_biometric_audit_events_action_check'`,
    );
    expect(actionConstraint.rows[0]?.definition).toContain("credential_reencrypted");
    expect(actionConstraint.rows[0]?.definition).toContain("master_destroyed");

    const appendOnlyTrigger = await pool.query<{ triggerName: string }>(
      `SELECT tgname AS "triggerName"
       FROM pg_trigger
       WHERE tgname = 'attendance_biometric_audit_immutable'
         AND NOT tgisinternal`,
    );
    expect(appendOnlyTrigger.rows).toEqual([
      { triggerName: "attendance_biometric_audit_immutable" },
    ]);
  });
});