import { describe, expect, it } from "vitest";

import {
  attlogAcknowledgementBody,
  attlogEventIdentity,
  extractAttlogStamp,
  extractSerialCandidate,
  optionsAllHandshakeBody,
  parseAttlogText,
} from "../src/modules/attendance/adms/protocol.js";

const validLine = "0042\t2026-08-28 07:13:20\t0\t1\t0\t0\t0\t0\t0\t0\t0";

describe("ADMS iClock protocol", () => {
  it("parses lossless eleven-field ATTLOG and preserves leading-zero PIN", () => {
    const parsed = parseAttlogText(validLine, "Asia/Jakarta", new Date("2026-08-28T08:00:00+07:00"));
    expect(parsed.quarantines).toEqual([]);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.pin).toBe("0042");
    expect(parsed.events[0]?.rawFields).toHaveLength(11);
    expect(parsed.events[0]?.occurredAt.toISOString()).toBe("2026-08-28T00:13:20.000Z");
  });

  it("quarantines invalid field count", () => {
    const parsed = parseAttlogText("0042\t2026-08-28 07:13:20", "Asia/Jakarta", new Date("2026-08-28T08:00:00+07:00"));
    expect(parsed.events).toEqual([]);
    expect(parsed.quarantines[0]?.reason).toBe("INVALID_FIELD_COUNT");
  });

  it("quarantines invalid and future timestamps", () => {
    const invalid = parseAttlogText(
      "0042\tbad-time\t0\t1\t0\t0\t0\t0\t0\t0\t0",
      "Asia/Jakarta",
      new Date("2026-08-28T08:00:00+07:00"),
    );
    expect(invalid.quarantines[0]?.reason).toBe("INVALID_TIMESTAMP");

    const future = parseAttlogText(
      "0042\t2026-08-30 07:13:20\t0\t1\t0\t0\t0\t0\t0\t0\t0",
      "Asia/Jakarta",
      new Date("2026-08-28T08:00:00+07:00"),
    );
    expect(future.quarantines[0]?.reason).toBe("FUTURE_TIMESTAMP");
  });

  it("extracts conventional serial candidates and opaque stamp", () => {
    const url = new URL("https://adms.example.test/iclock/cdata?SN=SPK7245000738&Stamp=9999");
    expect(extractSerialCandidate(url)).toBe("SPK7245000738");
    expect(extractAttlogStamp(url)).toBe("9999");
  });

  it("emits ATTLOG-only options handshake", () => {
    const url = new URL("https://adms.example.test/iclock/cdata?SN=SPK7245000738&options=all");
    const body = optionsAllHandshakeBody(url, "SPK7245000738", "9999");
    expect(body).toContain("GET OPTION FROM: SPK7245000738");
    expect(body).toContain("ATTLOGStamp=9999");
    expect(body).toContain("OPERLOGStamp=None");
    expect(body).toContain("TransFlag=TransData\tAttLog");
  });

  it("acknowledges durable ATTLOG record count", () => {
    expect(attlogAcknowledgementBody(`${validLine}\n${validLine}\n`)).toBe("OK: 2");
    expect(attlogAcknowledgementBody("")).toBe(null);
  });

  it("uses stable rich event identity", () => {
    const event = parseAttlogText(validLine, "Asia/Jakarta", new Date("2026-08-28T08:00:00+07:00")).events[0]!;
    expect(attlogEventIdentity("SERIAL-A", event)).toBe(attlogEventIdentity("SERIAL-A", event));
    expect(attlogEventIdentity("SERIAL-A", event)).not.toBe(attlogEventIdentity("SERIAL-B", event));
  });
});
