export type AdmsConnectivityStatus = "online" | "offline" | "unknown";

export interface AdmsDeviceHealth {
  deviceId: string;
  lifecycle: string;
  connectivityStatus: AdmsConnectivityStatus;
  lastSeenAt: string | null;
  lastSuccessfulRequestAt: string | null;
  lastIp: string | null;
  observedMedianRequestIntervalSeconds: number | null;
  effectiveConnectivityTimeoutSeconds: number | null;
  offlineAt: string | null;
  lastCommandActivityAt: string | null;
  lastTransactionActivityAt: string | null;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (response.ok) return body as T;
  throw new Error((body as { message?: string } | null)?.message ?? "Status mesin fingerprint tidak dapat dimuat.");
}

export async function getAdmsDeviceHealth(deviceId: string): Promise<AdmsDeviceHealth> {
  const response = await readJson<{ item: AdmsDeviceHealth }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/health`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
  return response.item;
}

export function connectivityLabel(status: AdmsConnectivityStatus) {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  return "Belum diketahui";
}
