import { describe, expect, it } from "vitest";

import {
  deviceUserAuthorizationWireCommand,
  deviceUserExpirationWireCommand,
  deviceUserUpsertWireCommand,
  isUserConfigWireCommand,
  ntpServerWireCommand,
  webServerWireCommand,
} from "../src/modules/attendance/adms/physical-parity-user-config-protocol.js";

describe("typed WDMS user lifecycle and config protocol", () => {
  it("preserves leading-zero PINs and never requires device-user deletion", () => {
    const upsert = deviceUserUpsertWireCommand({
      pin: "000205291318",
      name: "Pegawai Uji",
      group: 1,
      expiredTime: "2099-12-31 23:59:59",
    });
    const disable = deviceUserExpirationWireCommand("000205291318", "2000-01-01 00:00:00");
    const authorization = deviceUserAuthorizationWireCommand({
      pin: "000205291318",
      timezoneId: 0,
      doorId: 0,
    });

    expect(upsert).toContain("Pin=000205291318");
    expect(disable).toContain("Pin=000205291318");
    expect(authorization).toContain("Pin=000205291318");
    expect(`${upsert}\n${disable}\n${authorization}`).not.toContain("DATA DELETE user");
    expect(isUserConfigWireCommand(upsert)).toBe(true);
    expect(isUserConfigWireCommand(disable)).toBe(true);
    expect(isUserConfigWireCommand(authorization)).toBe(true);
  });

  it("builds only bounded typed NTP and server-address commands", () => {
    const ntp = ntpServerWireCommand("pool.ntp.org");
    const server = webServerWireCommand({ host: "adms.sabilulquran.or.id", port: 80 });
    expect(ntp).toBe("SET OPTIONS NTPServer=pool.ntp.org");
    expect(server).toBe("SET OPTIONS WebServerIP=adms.sabilulquran.or.id,WebServerPort=80");
    expect(isUserConfigWireCommand(ntp)).toBe(true);
    expect(isUserConfigWireCommand(server)).toBe(true);
  });

  it("rejects control characters, invalid ports and invalid PIN shapes", () => {
    expect(() => ntpServerWireCommand("pool.ntp.org\nREBOOT")).toThrow();
    expect(() => webServerWireCommand({ host: "adms.sabilulquran.or.id", port: 0 })).toThrow();
    expect(() => deviceUserExpirationWireCommand("20529x", "2000-01-01 00:00:00")).toThrow();
  });
});
