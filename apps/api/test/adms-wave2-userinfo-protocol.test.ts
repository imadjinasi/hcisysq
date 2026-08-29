import { describe, expect, it } from "vitest";

import {
  deviceCommandWireBody,
  userInfoQueryWireCommand,
} from "../src/modules/attendance/adms/protocol.js";

describe("ATT-005 Wave 2 single-PIN USERINFO protocol", () => {
  it("preserves leading zeros and emits only the documented single-PIN command", () => {
    const command = userInfoQueryWireCommand("0042");
    expect(command).toBe("DATA QUERY USERINFO PIN=0042");
    expect(deviceCommandWireBody("17", command)).toBe("C:17:DATA QUERY USERINFO PIN=0042\n");
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

  it("does not turn arbitrary DATA commands into an allowlisted wire body", () => {
    expect(() => deviceCommandWireBody("18", "DATA QUERY FINGERTMP PIN=0042")).toThrow(
      "Unsupported ADMS wire command",
    );
    expect(() => deviceCommandWireBody("18", "DATA QUERY USERINFO")).toThrow(
      "Unsupported ADMS wire command",
    );
  });
});
