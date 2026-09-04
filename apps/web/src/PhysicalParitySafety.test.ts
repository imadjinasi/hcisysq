import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const pageUrl = new URL("./pages/AdminAdmsDevicePhysicalParityPage.tsx", import.meta.url);
const deliveryPanelUrl = new URL("./pages/AdminAdmsDevicePhysicalDeliveryPanel.tsx", import.meta.url);
const clientUrl = new URL("./lib/admsPhysicalParity.ts", import.meta.url);

describe("full WDMS physical parity UI safety", () => {
  it("keeps operations typed, verified-only for execute, and locks non-terminal capability states", async () => {
    const source = `${await readFile(pageUrl, "utf8")}\n${await readFile(deliveryPanelUrl, "utf8")}`;
    expect(source).toContain("Full WDMS Physical Parity");
    expect(source).toContain("Danger zone / break-glass");
    expect(source).toContain("Biometric maintenance");
    expect(source).toContain("employee UUID (bukan NIP/nama/PIN)");
    expect(source).toContain("Tidak pernah menggunakan DATA DELETE user");
    expect(source).toContain('stateFor(capabilityKey) === "verified" ? "execute" : "canary"');
    expect(source).toContain('state === "canary_pending" || state === "unsupported" || state === "blocked"');
    expect(source).toContain('actionLocked("attendance_photo")');
    expect(source).not.toMatch(/<textarea\b/i);
    expect(source).not.toContain("wireCommand");
  });

  it("requires human-entered confirmations for high-risk physical actions", async () => {
    const page = await readFile(pageUrl, "utf8");
    const delivery = await readFile(deliveryPanelUrl, "utf8");

    expect(page).toContain("firmwareConfirmation !== firmwarePhrase");
    expect(page).toContain("destructiveConfirmation !== clearAttendancePhrase");
    expect(page).toContain("destructiveConfirmation !== clearPhotoPhrase");
    expect(page).toContain("destructiveConfirmation !== clearAllPhrase");
    expect(page).toContain("biometricEnrollConfirmation !== enrollPhrase");
    expect(page).toContain("biometricCredentialConfirmation !== restorePhrase");
    expect(page).toContain("biometricCredentialConfirmation !== deleteBiometricPhrase");
    expect(page).toContain("serverConfirmation !== serverPhrase");
    expect(page).toContain('readOnly aria-label="Approved ADMS server host"');
    expect(page).toContain('readOnly aria-label="Approved ADMS server port"');
    expect(page).toContain("nextMatrix.approvedServerTarget");

    expect(delivery).toContain("attendancePhotoConfirmation !== attendancePhotoPhrase");
    expect(delivery).toContain("setAttendancePhotoConfirmation(\"\")");
    expect(delivery).toContain('actionLocked("attendance_photo")');
  });

  it("never renders or fetches biometric secret fields or retired USERINFO reads", async () => {
    const source = `${await readFile(pageUrl, "utf8")}\n${await readFile(deliveryPanelUrl, "utf8")}\n${await readFile(clientUrl, "utf8")}`;
    expect(source).not.toContain("payload_ciphertext");
    expect(source).not.toContain("payload_iv");
    expect(source).not.toContain("payload_auth_tag");
    expect(source).not.toContain("encryption_key_id");
    expect(source).not.toContain("DATA QUERY USERINFO");
    expect(source).not.toMatch(/["'`]DATA DELETE user(?:["'`]|\\|$)/);
  });
});
