import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("ATT-005 Wave 3 operations safety", () => {
  it("keeps physical execution truth in the canonical capability projection", async () => {
    const wave3 = await source("../src/modules/attendance/adms/wave3-admin-routes.ts");
    const capabilities = await source("../src/modules/attendance/adms/operations-capability-state.ts");
    const protocol = await source("../src/modules/attendance/adms/protocol.ts");
    const wave2Protocol = await source("../src/modules/attendance/adms/wave2-protocol.ts");
    const combinedWire = `${protocol}\n${wave2Protocol}`;

    expect(wave3).toContain('arbitraryCommandEnabled: false');
    expect(wave3).toContain('userInfoReadsRetired: true');
    expect(wave3).toContain('deviceCommandsRequested: 0');
    expect(wave3).not.toContain('destructiveExecutionEnabled:');

    expect(capabilities).toContain('physicalKey: "work_code_delivery"');
    expect(capabilities).toContain('physicalKey: "message_delivery"');
    expect(capabilities).toContain('physicalKey: "firmware_upgrade"');
    expect(capabilities).toContain('physicalKey: "clear_all_data"');
    expect(capabilities).not.toContain('key: "read_information"');
    expect(capabilities).not.toContain('key: "transaction_recovery"');

    expect(wave3).not.toContain("DATA QUERY USERINFO");
    expect(wave3).not.toContain("DATA UPDATE USERINFO");
    expect(wave3).not.toMatch(/wire_command\s*=|INSERT INTO attendance_adms_commands/);

    expect(combinedWire).not.toContain("REBOOT");
    expect(combinedWire).not.toContain("CLEAR ALL");
    expect(combinedWire).not.toContain("FIRMWARE UPDATE");
  });

  it("keeps offline import on the canonical raw parser/dedupe/projection path", async () => {
    const wave3 = await source("../src/modules/attendance/adms/wave3-admin-routes.ts");
    const start = wave3.indexOf('app.post("/admin/attendance/adms/devices/:deviceId/offline-attlog-imports"');
    const end = wave3.indexOf('app.get("/admin/attendance/adms/devices/:deviceId/offline-attlog-imports"', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const offlineImport = wave3.slice(start, end);

    expect(offlineImport).toContain("parseAttlogText");
    expect(offlineImport).toContain("attlogEventIdentity");
    expect(offlineImport).toContain("attendance_adms_request_journal");
    expect(offlineImport).toContain("attendance_adms_events");
    expect(offlineImport).toContain("DUPLICATE_EXACT");
    expect(offlineImport).toContain("projectAdmsAttendanceDay");
    expect(offlineImport).toContain("deviceCommandsRequested: 0");
    expect(offlineImport).not.toMatch(/\b(late|absence|overtime|payroll)\b/i);
  });
});
