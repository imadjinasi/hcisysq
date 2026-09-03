import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const pageUrl = new URL("./pages/AdminAdmsDevicePhysicalParityPage.tsx", import.meta.url);
const clientUrl = new URL("./lib/admsPhysicalParity.ts", import.meta.url);

describe("full WDMS physical parity UI safety", () => {
  it("keeps operations typed and separates danger/biometric controls", async () => {
    const source = await readFile(pageUrl, "utf8");
    expect(source).toContain("Full WDMS Physical Parity");
    expect(source).toContain("Danger zone / break-glass");
    expect(source).toContain("Biometric maintenance");
    expect(source).toContain("employee UUID (bukan NIP/nama/PIN)");
    expect(source).toContain("Tidak pernah menggunakan DATA DELETE user");
    expect(source).not.toMatch(/<textarea\b/i);
    expect(source).not.toContain("wireCommand");
  });

  it("never renders or fetches biometric secret fields or retired USERINFO reads", async () => {
    const source = `${await readFile(pageUrl, "utf8")}\n${await readFile(clientUrl, "utf8")}`;
    expect(source).not.toContain("payload_ciphertext");
    expect(source).not.toContain("payload_iv");
    expect(source).not.toContain("payload_auth_tag");
    expect(source).not.toContain("encryption_key_id");
    expect(source).not.toContain("DATA QUERY USERINFO");
    expect(source).not.toMatch(/["'`]DATA DELETE user(?:["'`]|\\|$)/);
  });
});
