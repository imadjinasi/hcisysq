import { afterEach, describe, expect, it, vi } from "vitest";

import { getAdmsMappingLifecycleSummary } from "./admsMappingSummary";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ADMS mapping lifecycle summary client", () => {
  it("reads count-only lifecycle summary for one device", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      item: {
        deviceId: "00000000-0000-4000-8000-000000000801",
        activeMappingCount: 4,
        reviewRequiredCount: 1,
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAdmsMappingLifecycleSummary("00000000-0000-4000-8000-000000000801"))
      .resolves.toEqual({
        deviceId: "00000000-0000-4000-8000-000000000801",
        activeMappingCount: 4,
        reviewRequiredCount: 1,
      });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/attendance/adms/devices/00000000-0000-4000-8000-000000000801/mapping-lifecycle-summary",
      {
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );
  });

  it("does not convert a failed summary request into zero anomalies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Ringkasan belum tersedia.",
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(getAdmsMappingLifecycleSummary("00000000-0000-4000-8000-000000000801"))
      .rejects.toThrow("Ringkasan belum tersedia.");
  });
});
