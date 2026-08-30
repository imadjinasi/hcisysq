import { describe, expect, it } from "vitest";

import {
  deviceCommandWireBody,
  userInfoQueryWireCommand,
  userInfoRosterQueryWireCommand,
} from "../src/modules/attendance/adms/protocol.js";

describe("ATT-005 Wave 2 USERINFO protocol", () => {
  it("preserves leading zeros and emits only the documented single-PIN command", () => {
    const command = userInfoQueryWireCommand("0042");
    expect(command).toBe("DATA QUERY USERINFO PIN=0042");
    expect(deviceCommandWireBody("17", command)).toBe("C:17:DATA QUERY USERINFO PIN=0042\n");
  });

  it("emits the full roster canary as one exact allowlisted command", () => {
    const command = userInfoRosterQueryWireCommand();
    expect(command).toBe("DATA QUERY USERINFO");
    expect(deviceCommandWireBody("18", command)).toBe("C:18:DATA QUERY USERINFO\n");
  });

  it.each([
    "",
    " 42",
    "42 ",
    "4 2",
    "42\tName=Injected",
    "42\nDATA DELETE USERINFO PIN=7",
    "abc",
    "1".repeat(129),
  ])("rejects unsafe or unsupported PIN syntax: %j", (pin) => {
    expect(() => userInfoQueryWireCommand(pin)).toThrow("Invalid ADMS USERINFO PIN");
  });

  it.each([
    "DATA QUERY USERINFO ",
    " DATA QUERY USERINFO",
    "DATA QUERY USERINFO PIN=",
    "DATA QUERY USERINFO\tPIN=0042",
    "DATA QUERY FINGERTMP PIN=0042",
    "DATA QUERY USERINFO\nDATA QUERY FINGERTMP PIN=0042",
  ])("does not turn arbitrary DATA commands into an allowlisted wire body: %j", (wireCommand) => {
    expect(() => deviceCommandWireBody("19", wireCommand)).toThrow("Unsupported ADMS wire command");
  });
});
