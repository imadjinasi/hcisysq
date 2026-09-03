import { describe, expect, it } from "vitest";

import { commandActionLabel, commandStatusLabel, type AdmsCommandItem } from "@/lib/admsAdmin";

function command(input: Partial<AdmsCommandItem>): AdmsCommandItem {
  return {
    id: "command-id",
    commandNumber: "8",
    commandType: "data_query",
    reason: "admin_sync_new",
    status: "pending",
    attemptCount: 0,
    requestedRangeStart: null,
    requestedRangeEnd: null,
    expiresAt: "2026-08-30T15:00:00.000Z",
    deliveredAt: null,
    acknowledgedAt: null,
    completedAt: null,
    returnCode: null,
    createdAt: "2026-08-30T14:00:00.000Z",
    updatedAt: "2026-08-30T14:00:00.000Z",
    ...input,
  };
}

describe("device admin command copy", () => {
  it("translates operational command reasons into admin-facing language", () => {
    expect(commandActionLabel(command({ reason: "admin_sync_new" }))).toBe("Minta transaksi terbaru");
    expect(commandActionLabel(command({ reason: "admin_range_recovery" }))).toBe("Ambil ulang transaksi");
    expect(commandActionLabel(command({ reason: "admin_read_information", commandType: "read_info" }))).toBe("Baca informasi mesin");
  });

  it("labels retired legacy user-info history without parsing protocol payloads", () => {
    expect(commandActionLabel(command({ reason: "admin_query_user_info" }))).toBe("Baca data pengguna (riwayat lama)");
    expect(commandActionLabel(command({ reason: "admin_update_user_info" }))).toBe("Sinkronkan nama pengguna");
  });

  it("translates lifecycle states without protocol jargon", () => {
    expect(commandStatusLabel("pending")).toBe("Menunggu mesin");
    expect(commandStatusLabel("delivered")).toBe("Sudah dikirim");
    expect(commandStatusLabel("acknowledged")).toBe("Diterima mesin");
    expect(commandStatusLabel("succeeded")).toBe("Berhasil");
    expect(commandStatusLabel("failed")).toBe("Gagal");
  });
});
