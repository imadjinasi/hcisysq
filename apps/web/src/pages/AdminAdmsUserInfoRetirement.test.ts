import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(name: string) {
  return readFile(new URL(name, import.meta.url), "utf8");
}

describe("retired USERINFO read UI", () => {
  it("does not expose a per-user reread action or diagnostics canary", async () => {
    const [usersPage, diagnosticsPage] = await Promise.all([
      source("./AdminAdmsDeviceUsersPage.tsx"),
      source("./AdminAdmsDeviceDiagnosticsPage.tsx"),
    ]);

    expect(usersPage).not.toContain("Baca ulang dari mesin");
    expect(usersPage).not.toContain("queryAdmsUserInfo");
    expect(diagnosticsPage).not.toContain("Single-PIN metadata canary");
    expect(diagnosticsPage).not.toContain("queryAdmsUserInfo");
    expect(diagnosticsPage).not.toContain("Baca 1 PIN");
  });

  it("does not retain a client helper that queues USERINFO reads", async () => {
    const adminClient = await source("../lib/admsAdmin.ts");
    expect(adminClient).not.toContain("export async function queryAdmsUserInfo");
    expect(adminClient).not.toContain("/commands/query-user-info");
  });
});
