export type PhysicalCapabilityState = "documented" | "canary_pending" | "verified" | "failed" | "unsupported" | "blocked";
export type PhysicalMode = "canary" | "execute";

export interface PhysicalCapability {
  key: string;
  label: string;
  state: PhysicalCapabilityState;
  lastResultCode: number | null;
  verifiedAt: string | null;
  safeMetadata: Record<string, unknown>;
}

export interface PhysicalCapabilityMatrix {
  device: {
    id: string;
    serialNumber: string;
    displayName: string | null;
    model: string | null;
    firmwareVersion: string | null;
  };
  arbitraryCommandEnabled: false;
  activeUserInfoReadsRetired: true;
  biometricGate: {
    globalCollectionEnabled: boolean;
    deviceCollectionEnabled: boolean;
    keyringReady: boolean;
  };
  capabilities: PhysicalCapability[];
  runningOperations: Array<{
    id: string;
    capabilityKey: string;
    operationKey: string;
    mode: string;
    destructive: boolean;
    createdAt: string;
  }>;
}

export interface WdmsEvidence {
  device: {
    id: string;
    serialNumber: string;
    displayName: string | null;
    lifecycle: string;
    model: string | null;
    firmwareVersion: string | null;
    biometricCollectionEnabled: boolean;
    deviceRole: string;
    transferMode: string;
    heartbeatIntervalSeconds: number;
    desiredPushProtocolVersion: string | null;
    lastSeenAt: string | null;
  };
  evidence: {
    lastProtocolObservedAt: string | null;
    lastRegistrationAt: string | null;
    lastHeartbeatAt: string | null;
    observedPushProtocolVersion: string | null;
  };
  pushProfile: {
    transferMode: string;
    deviceRole: string;
    heartbeatIntervalSeconds: number;
    desiredPushProtocolVersion: string | null;
    baseTransferFlags: string[];
    biometricAdvertised: boolean;
    attendancePhotoAdvertised: boolean;
    idleAttendanceOnly: boolean;
  };
  activeUserInfoReadsRetired: true;
  arbitraryCommandEnabled: false;
}

export interface PhysicalOperationHistoryItem {
  id: string;
  capabilityKey: string;
  operationKey: string;
  mode: string;
  status: string;
  destructive: boolean;
  safeMetadata: Record<string, unknown>;
  failureCode: string | null;
  createdAt: string;
  completedAt: string | null;
  commandCount: number;
  succeededCommandCount: number;
  failedCommandCount: number;
  lastReturnCode: number | null;
}

export interface FirmwarePackageItem {
  id: string;
  targetModel: string;
  targetVersion: string;
  filename: string;
  byteLength: number;
  createdAt: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (response.ok) return body as T;
  throw new Error((body as { message?: string } | null)?.message ?? "Operasi physical parity tidak dapat diproses.");
}

async function post<T>(path: string, body: Record<string, unknown>) {
  return readJson<T>(await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

export async function getPhysicalCapabilityMatrix(deviceId: string) {
  const result = await readJson<{ item: PhysicalCapabilityMatrix }>(await fetch(
    `/api/admin/attendance/adms/devices/${deviceId}/physical-capabilities`,
    { credentials: "include", headers: { Accept: "application/json" } },
  ));
  return result.item;
}

export async function getWdmsEvidence(deviceId: string) {
  const result = await readJson<{ item: WdmsEvidence }>(await fetch(
    `/api/admin/attendance/adms/devices/${deviceId}/wdms-evidence`,
    { credentials: "include", headers: { Accept: "application/json" } },
  ));
  return result.item;
}

export async function listPhysicalOperationHistory(deviceId: string, limit = 100) {
  return readJson<{ items: PhysicalOperationHistoryItem[]; rawWireCommandsReturned: false }>(await fetch(
    `/api/admin/attendance/adms/devices/${deviceId}/physical/operations?limit=${limit}`,
    { credentials: "include", headers: { Accept: "application/json" } },
  ));
}

export async function syncPhysicalWorkCode(deviceId: string, workCodeId: string, desiredState: "present" | "absent", mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/work-code`, { workCodeId, desiredState, mode });
}

export async function syncPhysicalMessage(deviceId: string, messageId: string, desiredState: "present" | "absent", mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/message`, { messageId, desiredState, mode });
}

export async function activeTimeSync(deviceId: string, confirmation: string, mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/time-sync`, { confirmation, mode });
}

export async function setDuplicatePunch(deviceId: string, seconds: number, confirmation: string, mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/duplicate-punch`, { seconds, confirmation, mode });
}

export async function rebootDevice(deviceId: string, confirmation: string, mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/reboot`, { confirmation, mode });
}

export async function pushUserProfile(deviceId: string, employeeId: string, group: number, confirmation: string, mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number; deletesBiometrics: false }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/user-profile`, { employeeId, group, confirmation, mode });
}

export async function setUserEnabled(deviceId: string, employeeId: string, enabled: boolean, confirmation: string, mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number; deletesIdentity: false; deletesBiometrics: false }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/user-enabled`, { employeeId, enabled, confirmation, mode });
}

export async function setNtp(deviceId: string, host: string, confirmation: string, mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/ntp`, { host, confirmation, mode });
}

export async function setServer(deviceId: string, host: string, port: number, confirmation: string, mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/server-config`, { host, port, confirmation, mode });
}

export async function enableAttendancePhotoCanary(deviceId: string, confirmation: string) {
  return post<{ operationId: string; commandCount: 0; rawPhotoStored: false }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/attendance-photo-canary`, { confirmation });
}

export async function queryBiometric(deviceId: string, input: { employeeId: string; protocol: "legacy_fingerprint" | "unified"; biometricType: number; slotIndex: number; mode?: PhysicalMode }) {
  return post<{ operationId: string; commandCount: number }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/biometric-query`, { ...input, mode: input.mode ?? "canary" });
}

export async function enrollBiometric(deviceId: string, input: { employeeId: string; protocol: "legacy_fingerprint" | "unified"; biometricType: number; slotIndex: number; confirmation: string; mode?: PhysicalMode }) {
  return post<{ operationId: string; commandCount: number }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/biometric-enroll`, { ...input, retry: 3, overwrite: true, mode: input.mode ?? "canary" });
}

export async function restoreBiometric(deviceId: string, credentialId: string, confirmation: string, mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number; rawTemplateReturned: false }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/biometric-restore`, { credentialId, confirmation, mode });
}

export async function deleteBiometric(deviceId: string, credentialId: string, confirmation: string, mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number; masterCredentialDestroyed: false }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/biometric-delete`, { credentialId, confirmation, mode });
}

export async function clearPhysicalData(deviceId: string, kind: "clear-attendance" | "clear-photo" | "clear-all", confirmation: string, mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/${kind}`, { confirmation, mode });
}

export async function listFirmwarePackages() {
  return readJson<{ items: FirmwarePackageItem[] }>(await fetch("/api/admin/attendance/adms/firmware-packages", {
    credentials: "include",
    headers: { Accept: "application/json" },
  }));
}

export async function uploadFirmwarePackage(input: { file: File; targetModel: string; targetVersion: string }) {
  const query = new URLSearchParams({
    targetModel: input.targetModel,
    targetVersion: input.targetVersion,
    filename: input.file.name,
  });
  return readJson<{ item: FirmwarePackageItem }>(await fetch(`/api/admin/attendance/adms/firmware-packages?${query}`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/octet-stream" },
    body: input.file,
  }));
}

export async function upgradeFirmware(deviceId: string, packageId: string, confirmation: string, mode: PhysicalMode = "canary") {
  return post<{ operationId: string; commandCount: number }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/firmware`, { packageId, confirmation, mode });
}

export async function markCapabilityUnsupportedOrBlocked(deviceId: string, input: { capabilityKey: string; state: "unsupported" | "blocked"; note: string; confirmation: string }) {
  return post<{ item: { capabilityKey: string; state: string } }>(`/api/admin/attendance/adms/devices/${deviceId}/physical/capability-state`, input);
}

export const physicalExportUrls = (deviceId: string) => ({
  inventory: "/api/admin/attendance/adms/devices/export.csv",
  mappings: `/api/admin/attendance/adms/devices/${deviceId}/mappings/export.csv`,
  workCodes: `/api/admin/attendance/adms/devices/${deviceId}/work-codes/export.csv`,
  operations: `/api/admin/attendance/adms/devices/${deviceId}/physical/operations/export.csv`,
  audit: `/api/admin/attendance/adms/devices/${deviceId}/physical/audit/export.csv`,
  rawAttendance: `/api/admin/attendance/adms/devices/${deviceId}/attendance/export.csv`,
});
