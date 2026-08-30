import { describe, expect, it } from "vitest";

import {
  deviceCommandWireBody,
  userInfoNameUpdateWireCommand,
} from "../src/modules/attendance/adms/protocol.js";

describe("ATT-005 Wave 2 safe USERINFO update protocol", () => {
  it("preserves leading zero PIN and emits only Name field", () => {
    const command = userInfoNameUpdateWireCommand("0042", "Muhammad Kamal Faza");
    expect(command).toBe("DATA UPDATE USERINFO PIN=0042\tName=Muhammad Kamal Faza");
    expect(deviceCommandWireBody("17", command)).toBe(
      "C:17:DATA UPDATE USERINFO PIN=0042\tName=Muhammad Kamal Faza\n",
    );
  });

  it("rejects control-character field injection", () => {
    expect(() => userInfoNameUpdateWireCommand("0042", "Kamal\tPri=14")).toThrow(
      "Invalid ADMS USERINFO name",
    );
    expect(() => userInfoNameUpdateWireCommand("0042", "Kamal\nDATA DELETE USERINFO PIN=1")).toThrow(
      "Invalid ADMS USERINFO name",
    );
  });

  it("rejects arbitrary PIN injection", () => {
    expect(() => userInfoNameUpdateWireCommand("0042\tName=Injected", "Kamal")).toThrow(
      "Invalid ADMS USERINFO PIN",
    );
  });
});
