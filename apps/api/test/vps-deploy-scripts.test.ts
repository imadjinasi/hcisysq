import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const deployPath = join(root, "scripts/deploy-vps.sh");
const verifyPath = join(root, "scripts/verify-vps.sh");

describe("VPS deployment scripts", () => {
  it("have valid Bash syntax", () => {
    expect(() => execFileSync("bash", ["-n", deployPath], { stdio: "pipe" })).not.toThrow();
    expect(() => execFileSync("bash", ["-n", verifyPath], { stdio: "pipe" })).not.toThrow();
  });

  it("preserve the deployment safety boundaries", () => {
    const deploy = readFileSync(deployPath, "utf8");
    const verify = readFileSync(verifyPath, "utf8");

    expect(deploy).toContain("pg_dump -Fc");
    expect(deploy).toContain("BIOMETRIC_COLLECTION_ENABLED=0");
    expect(deploy).toContain("git pull --ff-only");
    expect(deploy).toContain("Database TIDAK di-rollback otomatis");
    expect(deploy).toContain('PREVIOUS_SHA=$(git rev-parse HEAD)');
    expect(deploy).toContain('if [[ "$PREVIOUS_SHA" == "$EXPECTED_SHA" ]]');
    expect(deploy).not.toMatch(/docker\s+compose[^\n]*down\s+-v/);

    expect(verify).toContain("attendance_adms_reject_retired_userinfo_reads");
    expect(verify).toContain("BIOMETRIC_COLLECTION_ENABLED=0");
    expect(verify).toContain("biometric_collection_enabled = true");
    expect(verify).toContain("attendance_biometric_audit_events_append_only");
    expect(verify).toContain("last_reencrypted_by_account_id");
    expect(verify).toContain("verification_device_commands_requested=0");
    expect(verify).not.toContain("BIOMETRIC_ENCRYPTION_KEYS=");
    expect(verify).not.toContain("BIOMETRIC_ACTIVE_KEY_ID=");
    expect(verify).not.toMatch(/docker\s+compose[^\n]*down\s+-v/);
  });
});
