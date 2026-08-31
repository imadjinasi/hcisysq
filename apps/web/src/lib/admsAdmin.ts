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

export interface AdmsRosterItem {
  id: string;
  pin: string;
  displayName: string | null;
  cardNumber: string | null;
  privilege: string | null;
  verifyMode: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceRequestId: string;
  mappingId: string | null;
  employeeId: string | null;
  employeeNumber: string | null;
  employeeName: string | null;
  employeeStatus: string | null;
  mappingStatus: "mapped" | "unmapped";
}

export interface AdmsRosterResponse {
  inventorySemantics: "observed_only";
  completeSnapshot: false;
  note: string;
  items: AdmsRosterItem[];
}

export interface AdmsMappingCandidate {
  id: string;
  employeeNumber: string;
  fullName: string;
  unitName: string | null;
  positionName: string | null;
  similarity: number;
  matchKind: "exact_name" | "close_name" | "possible_name";
}

export interface AdmsMappingAssistantItem {
  pin: string;
  eventCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  rosterDisplayName: string | null;
  cardNumber: string | null;
  privilege: string | null;
  verifyMode: string | null;
  rosterObservedAt: string | null;
  rosterSourceRequestId: string | null;
  requiresUserInfo: boolean;
  candidates: AdmsMappingCandidate[];
}

export interface AdmsMappingAssistantResponse {
  inventorySemantics: "observed_union";
  completeSnapshot: false;
  autoMapping: false;
  scoring: {
    basis: "name_only";
    candidateLimit: number;
    minimumSimilarity: number;
    note: string;
  };
  note: string;
  items: AdmsMappingAssistantItem[];
}

export interface AdmsCommandItem {
  id: string;
  commandNumber: string;
  commandType: string;
  wireCommand: string;
  reason: string;
  status: string;
  attemptCount: number;
  requestedRangeStart: string | null;
  requestedRangeEnd: string | null;
  expiresAt: string;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  completedAt: string | null;
  returnCode: number | null;
  resultCommand: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdmsTransactionItem {
  id: string;
  pin: string;
  occurredAtRaw: string;
  occurredAt: string;
  receivedAt: string;
  sourceRequestId: string;
  employeeId: string | null;
  employeeNumber: string | null;
  employeeName: string | null;
}

export interface AdmsUserCorrectionItem {
  id: string;
  deviceId: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  legacyPin: string;
  intendedPin: string;
  reason: string | null;
  status: "planned" | "cancelled" | "resolved";
  createdAt: string;
  cancelledAt: string | null;
  resolvedAt: string | null;
}

export interface AdmsUserCorrectionsResponse {
  executionPolicy: "planning_only";
  destructivePinMutationEnabled: false;
  biometricTransferValidated: false;
  items: AdmsUserCorrectionItem[];
}

export interface AdmsQueuedCommand {
  id: string;
  commandNumber: string;
  commandType: string;
  reason: string;
  status: string;
  createdAt: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (response.ok) return body as T;
  throw new Error((body as { message?: string } | null)?.message ?? "Operasi mesin fingerprint tidak dapat diproses.");
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

export async function getAdmsDeviceRoster(deviceId: string): Promise<AdmsRosterResponse> {
  return readJson(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/roster`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function getAdmsMappingAssistant(deviceId: string): Promise<AdmsMappingAssistantResponse> {
  return readJson(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/mapping-assistant`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function listAdmsCommands(deviceId: string): Promise<{ items: AdmsCommandItem[] }> {
  return readJson(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/commands`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function listAdmsTransactions(deviceId: string): Promise<{ items: AdmsTransactionItem[] }> {
  return readJson(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/transactions`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function listAdmsUserCorrections(deviceId: string): Promise<AdmsUserCorrectionsResponse> {
  return readJson(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/user-corrections`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function syncAdmsUserName(deviceId: string, pin: string) {
  return readJson<{
    item: AdmsQueuedCommand & {
      pin: string;
      currentName: string | null;
      targetName: string;
      sameValue: boolean;
      expectedResultCommand: "DATA";
      verificationRequired: string;
    };
  }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/users/${encodeURIComponent(pin)}/commands/sync-name`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function planAdmsPinCorrection(deviceId: string, legacyPin: string, intendedPin: string) {
  return readJson<{ item: AdmsUserCorrectionItem }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/user-corrections`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ legacyPin, intendedPin }),
    }),
  );
}

export async function cancelAdmsPinCorrection(correctionId: string) {
  const response = await fetch(`/api/admin/attendance/adms/user-corrections/${correctionId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (response.ok) return;
  await readJson<never>(response);
}

export async function requestAdmsSyncNew(deviceId: string) {
  return readJson<{ item: AdmsQueuedCommand }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/transfers/sync-new`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function requestAdmsAttendanceRange(deviceId: string, startAt: string, endAt: string) {
  return readJson<{ item: AdmsQueuedCommand }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/transfers/attendance-range`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ startAt, endAt }),
    }),
  );
}

export async function cancelAdmsCommand(commandId: string) {
  const response = await fetch(`/api/admin/attendance/adms/commands/${commandId}/cancel`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (response.ok) return;
  await readJson<never>(response);
}

export function connectivityLabel(status: AdmsConnectivityStatus) {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  return "Belum diketahui";
}

export function commandStatusLabel(status: string) {
  if (status === "pending") return "Menunggu mesin";
  if (status === "delivered") return "Sudah dikirim";
  if (status === "acknowledged") return "Diterima mesin";
  if (status === "succeeded") return "Berhasil";
  if (status === "failed") return "Gagal";
  if (status === "cancelled") return "Dibatalkan";
  if (status === "expired") return "Kedaluwarsa";
  return status;
}

export function commandActionLabel(command: Pick<AdmsCommandItem, "reason" | "wireCommand" | "requestedRangeStart" | "requestedRangeEnd">) {
  if (command.reason === "admin_sync_new") return "Minta transaksi terbaru";
  if (command.reason === "admin_range_recovery") return "Ambil ulang transaksi";
  if (command.reason === "scheduled_reconciliation") return "Rekonsiliasi transaksi terjadwal";
  if (command.reason === "registration_recovery") return "Pemulihan transaksi awal";
  if (command.reason === "admin_read_information") return "Baca informasi mesin";
  if (command.reason === "admin_query_user_info") {
    const match = command.wireCommand.match(/^DATA QUERY USERINFO PIN=(\d+)/);
    return match ? `Baca data pengguna ${match[1]}` : "Baca data pengguna";
  }
  if (command.reason === "admin_update_user_info") {
    const match = command.wireCommand.match(/^DATA UPDATE USERINFO PIN=(\d+)/);
    return match ? `Sinkronkan nama pengguna ${match[1]}` : "Sinkronkan nama pengguna";
  }
  return command.reason.replaceAll("_", " ");
}
