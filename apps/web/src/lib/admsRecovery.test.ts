import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listAdmsRecoveryJobs,
  recoveryProgress,
  recoveryStatusLabel,
  requestAdmsLongRangeRecovery,
} from "./admsRecovery";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ADMS recovery web client", () => {
  it("labels status and computes bounded progress", () => {
    expect(recoveryStatusLabel("running")).toBe("Berjalan");
    expect(recoveryStatusLabel("succeeded")).toBe("Selesai");
    expect(recoveryStatusLabel("failed")).toBe("Gagal");
    expect(recoveryStatusLabel("cancelled")).toBe("Dibatalkan");
    expect(recoveryProgress({ succeededChunks: 2, totalChunks: 3 })).toBe(67);
    expect(recoveryProgress({ succeededChunks: 99, totalChunks: 3 })).toBe(100);
  });

  it("uses explicit credentialed read and create endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        execution: "serialized_bounded_attlog",
        maxChunkDays: 31,
        maxRangeDays: 730,
        note: "synthetic",
        items: [],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        item: {
          id: "00000000-0000-4000-8000-000000000901",
          deviceId: "00000000-0000-4000-8000-000000000902",
          requestedRangeStart: "2026-01-01T00:00:00.000Z",
          requestedRangeEnd: "2026-03-15T00:00:00.000Z",
          chunkDays: 31,
          totalChunks: 3,
          status: "running",
          firstCommandNumber: "44",
        },
      }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await listAdmsRecoveryJobs("00000000-0000-4000-8000-000000000902");
    await requestAdmsLongRangeRecovery(
      "00000000-0000-4000-8000-000000000902",
      "2026-01-01T00:00:00.000Z",
      "2026-03-15T00:00:00.000Z",
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/attendance/adms/devices/00000000-0000-4000-8000-000000000902/recovery-jobs",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/attendance/adms/devices/00000000-0000-4000-8000-000000000902/transfers/attendance-recovery-job",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});
