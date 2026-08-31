import { describe, expect, it } from "vitest";

import {
  attlogRangeWireCommand,
  deviceCommandWireBody,
  userInfoNameUpdateWireCommand,
} from "../src/modules/attendance/adms/protocol.js";

describe("retired active USERINFO read capabilities", () => {
  it.each([
    "DATA QUERY USERINFO",
    "DATA QUERY USERINFO PIN=00042",
    "DATA QUERY USERINFO PIN=42 Extra=1",
    "DATA QUERY USERINFO Name=Synthetic",
  ])("rejects USERINFO query shape %j at the serializer boundary", (wireCommand) => {
    expect(() => deviceCommandWireBody("12", wireCommand)).toThrow("Unsupported ADMS wire command");
  });

  it("preserves same-PIN name update, LOG, INFO, and bounded ATTLOG", () => {
    const nameUpdate = userInfoNameUpdateWireCommand("00042", "Synthetic Employee");
    expect(deviceCommandWireBody("13", nameUpdate)).toBe(
      "C:13:DATA UPDATE USERINFO PIN=00042\tName=Synthetic Employee\n",
    );
    expect(deviceCommandWireBody("14", "LOG")).toBe("C:14:LOG\n");
    expect(deviceCommandWireBody("15", "INFO")).toBe("C:15:INFO\n");
    const attlog = attlogRangeWireCommand("2026-08-31 00:00:00", "2026-08-31 00:10:00");
    expect(deviceCommandWireBody("16", attlog)).toBe(
      "C:16:DATA QUERY ATTLOG StartTime=2026-08-31 00:00:00\tEndTime=2026-08-31 00:10:00\n",
    );
  });
});
