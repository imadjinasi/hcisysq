import { describe, expect, it } from "vitest";

import {
  attlogRangeWireCommand,
  deviceCommandWireBody,
  formatDeviceLocalTimestamp,
  parseDeviceCommandResultText,
} from "../src/modules/attendance/adms/protocol.js";

describe("ADMS Wave 1 command transport", () => {
  it("serializes documented DATA QUERY ATTLOG range command", () => {
    const command = attlogRangeWireCommand("2026-08-28 00:00:00", "2026-08-28 23:59:59");
    expect(command).toBe(
      "DATA QUERY ATTLOG StartTime=2026-08-28 00:00:00\tEndTime=2026-08-28 23:59:59",
    );
    expect(deviceCommandWireBody(17, command)).toBe(
      "C:17:DATA QUERY ATTLOG StartTime=2026-08-28 00:00:00\tEndTime=2026-08-28 23:59:59\n",
    );
  });

  it("serializes only the documented read-only INFO discovery command", () => {
    expect(deviceCommandWireBody(18, "INFO")).toBe("C:18:INFO\n");
    const parsed = parseDeviceCommandResultText(
      [
        "ID=18&Return=0&CMD=INFO",
        "TransactionCount=42",
        "FPCount=10",
        "FWVersion=ZMM510-NF28VA-Ver2.0.16",
        "SecretThing=must-not-be-retained",
      ].join("\n"),
    );
    expect(parsed.quarantines).toEqual([]);
    expect(parsed.results).toEqual([
      {
        rawLine: "ID=18&Return=0&CMD=INFO",
        commandNumber: "18",
        returnCode: 0,
        command: "INFO",
        safeOptions: {
          TransactionCount: "42",
          FPCount: "10",
          FWVersion: "ZMM510-NF28VA-Ver2.0.16",
        },
      },
    ]);
  });

  it("formats an instant in the configured device timezone", () => {
    expect(
      formatDeviceLocalTimestamp(new Date("2026-08-28T17:00:00.000Z"), "Asia/Jakarta"),
    ).toBe("2026-08-29 00:00:00");
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
