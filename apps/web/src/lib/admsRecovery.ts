export type AdmsRecoveryJobStatus = "running" | "succeeded" | "failed" | "cancelled";

export interface AdmsRecoveryJob {
  id: string;
  deviceId: string;
  requestedRangeStart: string;
  requestedRangeEnd: string;
  chunkDays: number;
  totalChunks: number;
  status: AdmsRecoveryJobStatus;
  failureReason: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  succeededChunks: number;
  failedChunks: number;
  expiredChunks: number;
  cancelledChunks: number;
  queuedChunks: number;
  activeChunks: number;
  activeCommandNumber: string | null;
}

export interface AdmsRecoveryJobsResponse {
  execution: "serialized_bounded_attlog";
  maxChunkDays: 31;
  maxRangeDays: 730;
  note: string;
  items: AdmsRecoveryJob[];
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (response.ok) return body as T;
  throw new Error((body as { message?: string } | null)?.message ?? "Pemulihan transaksi tidak dapat diproses.");
}

export async function listAdmsRecoveryJobs(deviceId: string): Promise<AdmsRecoveryJobsResponse> {
  return readJson(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/recovery-jobs`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function requestAdmsLongRangeRecovery(
  deviceId: string,
  startAt: string,
  endAt: string,
  chunkDays = 31,
) {
  return readJson<{
    item: {
      id: string;
      deviceId: string;
      requestedRangeStart: string;
      requestedRangeEnd: string;
      chunkDays: number;
      totalChunks: number;
      status: "running";
      firstCommandNumber: string | null;
    };
  }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/transfers/attendance-recovery-job`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ startAt, endAt, chunkDays }),
    }),
  );
}

export async function cancelAdmsRecoveryJob(jobId: string) {
  const response = await fetch(`/api/admin/attendance/adms/recovery-jobs/${jobId}/cancel`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (response.ok) return;
  await readJson<never>(response);
}

export function recoveryStatusLabel(status: AdmsRecoveryJobStatus) {
  if (status === "running") return "Berjalan";
  if (status === "succeeded") return "Selesai";
  if (status === "failed") return "Gagal";
  return "Dibatalkan";
}

export function recoveryProgress(job: Pick<AdmsRecoveryJob, "succeededChunks" | "totalChunks">) {
  if (job.totalChunks <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((job.succeededChunks / job.totalChunks) * 100)));
}
