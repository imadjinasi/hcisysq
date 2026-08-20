import { randomUUID } from "node:crypto";

import { z } from "zod";

import { loadConfig } from "../../../config/env.js";
import { createPool } from "../../../db/pool.js";
import {
  buildTotpUri,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashPassword,
  hashRecoveryCode,
} from "../crypto.js";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(14).max(256);

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

async function bootstrap() {
  if (process.env.HCIS_ALLOW_SUPER_ADMIN_BOOTSTRAP !== "1") {
    throw new Error(
      "Set HCIS_ALLOW_SUPER_ADMIN_BOOTSTRAP=1 only for the one-time bootstrap command.",
    );
  }

  const email = emailSchema.parse(
    readArgument("--email") ?? "admin@hcis.sabilulquran.or.id",
  ).toLowerCase();
  const password = passwordSchema.parse(process.env.HCIS_BOOTSTRAP_PASSWORD);
  const config = loadConfig();
  if (!config.AUTH_ENCRYPTION_KEY) {
    throw new Error("AUTH_ENCRYPTION_KEY is required for Super Admin bootstrap.");
  }
  const pool = createPool(config.DATABASE_URL);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('hcis-super-admin-bootstrap'))");

    const existing = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM accounts WHERE principal_type = 'SUPER_ADMIN'`,
    );
    if (Number(existing.rows[0]?.count ?? "0") > 0) {
      throw new Error(
        "Super Admin already exists. Bootstrap refuses to create or rotate privileged accounts.",
      );
    }

    const accountId = randomUUID();
    const passwordHash = await hashPassword(password);
    const totpSecret = generateTotpSecret();
    const encrypted = encryptSecret(totpSecret, config.AUTH_ENCRYPTION_KEY);
    const recoveryCodes = generateRecoveryCodes();

    await client.query(
      `
        INSERT INTO accounts (
          id,
          email,
          principal_type,
          status,
          password_hash,
          password_changed_at,
          mfa_secret_ciphertext,
          mfa_secret_iv,
          mfa_secret_tag,
          mfa_enabled_at
        ) VALUES ($1, $2, 'SUPER_ADMIN', 'active', $3, now(), $4, $5, $6, now())
      `,
      [
        accountId,
        email,
        passwordHash,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
      ],
    );

    for (const code of recoveryCodes) {
      await client.query(
        `
          INSERT INTO auth_recovery_codes (id, account_id, code_hash)
          VALUES ($1, $2, $3)
        `,
        [randomUUID(), accountId, hashRecoveryCode(code)],
      );
    }

    await client.query(
      `
        INSERT INTO auth_audit_events (id, account_id, event_type, email)
        VALUES ($1, $2, 'auth.super_admin.bootstrapped', $3)
      `,
      [randomUUID(), accountId, email],
    );

    await client.query("COMMIT");

    console.log(`Super Admin created: ${email}`);
    console.log("");
    console.log("Add this TOTP secret to an authenticator application:");
    console.log(totpSecret);
    console.log("");
    console.log("Authenticator URI:");
    console.log(buildTotpUri(email, totpSecret));
    console.log("");
    console.log("Recovery codes (shown once; store them offline):");
    for (const code of recoveryCodes) console.log(code);
    console.log("");
    console.log("Do not paste the TOTP secret or recovery codes into chat or commit them.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
