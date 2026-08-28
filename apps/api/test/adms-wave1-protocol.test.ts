import { describe, expect, it } from "vitest";

import {
  attlogRangeWireCommand,
  deviceCommandWireBody,
} from "../src/modules/attendance/adms/protocol.js";

describe("ADMS Wave 1 range transport", () => {
  it("serializes documented DATA QUERY ATTLOG range command", () => {
    const command = attlogRangeWireCommand("2026-08-28 00:00:00", "2026-08-28 23:59:59");
    expect(command).toBe(
      "DATA QUERY ATTLOG StartTime=2026-08-28 00:00:00\tEndTime=2026-08-28 23:59:59",
    );
    expect(deviceCommandWireBody(17, command)).toBe(
      "C:17:DATA QUERY ATTLOG StartTime=2026-08-28 00:00:00\tEndTime=2026-08-28 23:59:59\n",
    );
  });

  it("rejects arbitrary remote command text", () => {
    expect(() => deviceCommandWireBody(17, "Shell rm -rf /")).toThrow(
      "Unsupported ADMS wire command",
    );
    expect(() => attlogRangeWireCommand("bad", "2026-08-28 23:59:59")).toThrow(
      "Invalid ADMS ATTLOG range command",
    );
  });
});
