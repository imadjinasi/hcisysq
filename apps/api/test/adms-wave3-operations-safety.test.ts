import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("ATT-005 Wave 3 operations safety", () => {
  it("keeps unverified hardware operations capability-gated instead of inventing wire commands", async () => {
    const wave3 = await source("../src/modules/attendance/adms/wave3-admin-routes.ts");
    const protocol = await source("../src/modules/attendance/adms/protocol.ts");
    const wave2Protocol = await source("../src/modules/attendance/adms/wave2-protocol.ts");
    const combinedWire = `${protocol}\n${wave2Protocol}`;

    expect(wave3).toContain('destructiveExecutionEnabled: false');
    expect(wave3).toContain('arbitraryCommandEnabled: false');
    expect(wave3).toContain('userInfoReadsRetired: true');
    expect(wave3).toContain('deviceCommandsRequested: 0');
    expect(wave3).toContain('work_code_delivery');
    expect(wave3).toContain('message_delivery');
    expect(wave3).toContain('firmware_upgrade');
    expect(wave3).toContain('clear_all_data');
    expect(wave3).not.toContain("DATA QUERY USERINFO");
    expect(wave3).not.toContain("DATA UPDATE USERINFO");
    expect(wave3).not.toMatch(/wire_command\s*=|INSERT INTO attendance_adms_commands/);

    expect(combinedWire).not.toContain("REBOOT");
    expect(combinedWire).not.toContain("CLEAR ALL");
    expect(combinedWire).not.toContain("FIRMWARE UPDATE");
  });

  it("keeps offline import on the canonical raw parser/dedupe/projection path", async () => {
    const wave3 = await source("../src/modules/attendance/adms/wave3-admin-routes.ts");
    expect(wave3).toContain("parseAttlogText");
    expect(wave3).toContain("attlogEventIdentity");
    expect(wave3).toContain("attendance_adms_request_journal");
    expect(wave3).toContain("attendance_adms_events");
    expect(wave3).toContain("DUPLICATE_EXACT");
    expect(wave3).toContain("projectAdmsAttendanceDay");
    expect(wave3).not.toMatch(/late|absence|overtime|payroll/i);
  });
});