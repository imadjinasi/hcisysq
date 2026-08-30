import { describe, expect, it } from "vitest";

import { deviceCommandWireBody } from "../src/modules/attendance/adms/protocol.js";

describe("retired full roster USERINFO capability", () => {
  it("rejects the exact full-roster wire command at the serializer boundary", () => {
    expect(() => deviceCommandWireBody("12", "DATA QUERY USERINFO")).toThrow("Unsupported ADMS wire command");
  });

  it("keeps the physically verified single-PIN USERINFO query available", () => {
    expect(deviceCommandWireBody("13", "DATA QUERY USERINFO PIN=00042")).toBe(
      "C:13:DATA QUERY USERINFO PIN=00042\n",
    );
  });
});
