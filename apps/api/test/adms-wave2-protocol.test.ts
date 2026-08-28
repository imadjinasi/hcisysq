import { describe, expect, it } from "vitest";

import {
  extractProtocolTable,
  isAttlogDeviceData,
  parseSafeDeviceRosterRecords,
  shouldRedactDeviceDataBody,
} from "../src/modules/attendance/adms/wave2-protocol.js";

const attlogShaped = "0042\t2026-08-28 07:13:20\t0\t1\t0\t0\t0\t0\t0\t0\t0";

describe("ATT-005 Wave 2 protocol safety", () => {
  it("uses structural ATTLOG fallback only when no explicit table is supplied", () => {
    expect(isAttlogDeviceData({ table: null, text: attlogShaped })).toBe(true);
    expect(isAttlogDeviceData({ table: "ATTLOG", text: "anything" })).toBe(true);
    expect(isAttlogDeviceData({ table: "FINGERTMP", text: attlogShaped })).toBe(false);
    expect(
      shouldRedactDeviceDataBody({
        method: "POST",
        path: "/iclock/cdata",
        table: "FINGERTMP",
        text: attlogShaped,
      }),
    ).toBe(true);
  });

  it("normalizes protocol table keys without accepting arbitrary values", () => {
    expect(extractProtocolTable(new URL("http://x/iclock/cdata?Table=fingertmp"))).toBe("FINGERTMP");
    expect(extractProtocolTable(new URL("http://x/iclock/cdata?table=bad%20table"))).toBeNull();
  });

  it("keeps leading-zero PIN and allowlisted roster fields while dropping passwords and unknown fields", () => {
    const parsed = parseSafeDeviceRosterRecords(
      "USER PIN=0042\tName=Pegawai Synthetic\tPasswd=secret\tCard=00001234\tPri=0\tVerify=1\tGrp=2\tTZ=ABC\tTMP=never-copy",
    );
    expect(parsed).toEqual([
      {
        pin: "0042",
        displayName: "Pegawai Synthetic",
        cardNumber: "00001234",
        privilege: "0",
        verifyMode: "1",
        safeMetadata: { group: "2", timezone: "ABC" },
      },
    ]);
    expect(JSON.stringify(parsed)).not.toContain("secret");
    expect(JSON.stringify(parsed)).not.toContain("never-copy");
    expect(JSON.stringify(parsed)).not.toContain("Passwd");
  });

  it("ignores fingerprint/template operation records instead of interpreting them as users", () => {
    expect(
      parseSafeDeviceRosterRecords(
        "FP PIN=0042\tFID=1\tTMP=synthetic-template\nBIODATA PIN=0042\tType=1\tNo=0\tTMP=synthetic-template",
      ),
    ).toEqual([]);
  });
});
