export interface AdmsDetectedDevice {
  id: string;
  serialNumber: string;
  status: "detected" | "claimed" | "ignored";
  firstSeenAt: string;
  lastSeenAt: string;
  lastIp: string | null;
  observedCount: number;
  claimedDeviceId: string | null;
}

export interface AdmsTelemetry {
  deviceId: string;
  model: string | null;
  firmwareVersion: string | null;
  transportObserved: Record<string, unknown> | null;
  infoObserved: Record<string, unknown> | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastSuccessfulRequestAt: string | null;
  lastIp: string | null;
  reconciliationEnabled: boolean;
  reconciliationIntervalMinutes: number;
  reconciliationLookbackHours: number;
  reconciliationLastRequestedAt: string | null;
}

export interface AdmsReconciliationItem {
  commandId: string;
  commandNumber: string;
  reason: string;
  status: string;
  requestedRangeStart: string;
  requestedRangeEnd: string;
  deliveredAt: string | null;
  completedAt: string | null;
  createdAt: string;
  currentPersistedCount: number;
  persistedSinceDeliveryCount: number;
  firstOccurredAt: string | null;
  lastOccurredAt: string | null;
  attlogRequestCount: number;
}

export interface AdmsReconciliationResponse {
  coverageBasis: "persisted_range";
  expectedCount: null;
  duplicatesObserved: null;
  note: string;
  items: AdmsReconciliationItem[];
}

export interface AdmsSafeLogs {
  rawRequestBodiesExposed: false;
  requests: Array<{
    id: string;
    method: string;
    path: string;
    classification: string;
    responseStatus: number;
    bodyByteLength: number;
    bodyCaptured: boolean;
    receivedAt: string;
  }>;
  commandEvents: Array<{
    id: string;
    commandId: string;
    commandNumber: string;
    commandType: string;
    eventType: string;
    requestId: string | null;
    createdAt: string;
  }>;
  quarantines: Array<{
    id: string;
    requestId: string;
    reason: string;
    details: Record<string, unknown>;
    createdAt: string;
  }>;
  adminAudit: Array<{
    id: string;
    action: string;
    createdAt: string;
  }>;
}

export interface AdmsBiometricPolicy {
  deviceId: string;
  lifecycle: "active" | "disabled" | "quarantined";
  globalCollectionEnabled: boolean;
  deviceCollectionEnabled: boolean;
  effectiveCollectionEnabled: boolean;
  enabledAt: string | null;
  enabledByAccountId: string | null;
}

export interface AdmsBiometricCredential {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  employeeStatus: string;
  modality: "fingerprint" | "face" | "palm" | "bio_photo";
  slotIndex: number | null;
  vendorFormat: string;
  vendorVersion: string | null;
  originDeviceId: string | null;
  originDeviceSerial: string | null;
  sourcePin: string | null;
  capturedAt: string | null;
  importedAt: string;
  lifecycle: "active" | "retired" | "destroyed";
  payloadByteLength: number | null;
}

export interface AdmsBiometricCredentialResponse {
  collectionEnabled: boolean;
  globalCollectionEnabled: boolean;
  rawPayloadExposed: false;
  items: AdmsBiometricCredential[];
}

export interface AdmsBiometricReplica {
  credentialId: string;
  state: "unknown" | "missing" | "present" | "stale" | "conflict" | "pending" | "succeeded" | "failed";
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  modality: string;
  slotIndex: number | null;
  vaultVendorFormat: string;
  deviceVendorFormat: string | null;
  credentialLifecycle: string;
  observedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
}

export interface AdmsBiometricInventoryResponse {
  inventorySemantics: "known_replica_state";
  rawPayloadExposed: false;
  items: AdmsBiometricReplica[];
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (response.ok) return body as T;
  throw new Error((body as { message?: string } | null)?.message ?? "Data teknis mesin tidak dapat diproses.");
}

export async function listDetectedAdmsDevices(): Promise<{ items: AdmsDetectedDevice[] }> {
  return readJson(
    await fetch("/api/admin/attendance/adms/detected-devices", {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function claimDetectedAdmsDevice(detectedId: string, displayName: string | null) {
  return readJson<{ item: { id: string; serialNumber: string } }>(
    await fetch(`/api/admin/attendance/adms/detected-devices/${detectedId}/claim`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, timezone: "Asia/Jakarta" }),
    }),
  );
}

export async function getAdmsTelemetry(deviceId: string): Promise<AdmsTelemetry> {
  const result = await readJson<{ item: AdmsTelemetry }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/telemetry`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
  return result.item;
}

export async function getAdmsReconciliation(deviceId: string): Promise<AdmsReconciliationResponse> {
  return readJson(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/reconciliation`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function getAdmsSafeLogs(deviceId: string): Promise<AdmsSafeLogs> {
  return readJson(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/logs`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function updateAdmsConnectivityPolicy(deviceId: string, timeoutSeconds: number | null) {
  return readJson(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/connectivity-policy`, {
      method: "PATCH",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ timeoutSeconds }),
    }),
  );
}

export async function updateAdmsReconciliationPolicy(
  deviceId: string,
  input: { enabled: boolean; intervalMinutes: number; lookbackHours: number },
) {
  return readJson(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/reconciliation-policy`, {
      method: "PATCH",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function requestAdmsReadInformation(deviceId: string) {
  return readJson<{ item: { commandNumber: string; status: string } }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/commands/read-information`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function getAdmsBiometricPolicy(deviceId: string): Promise<AdmsBiometricPolicy> {
  const result = await readJson<{ item: AdmsBiometricPolicy }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/biometric-collection-policy`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
  return result.item;
}

export async function updateAdmsBiometricPolicy(deviceId: string, enabled: boolean): Promise<AdmsBiometricPolicy> {
  const result = await readJson<{ item: AdmsBiometricPolicy }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/biometric-collection-policy`, {
      method: "PATCH",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),
  );
  return result.item;
}

export async function listAdmsBiometricCredentials(deviceId: string): Promise<AdmsBiometricCredentialResponse> {
  return readJson(
    await fetch(`/api/admin/attendance/adms/biometrics?originDeviceId=${encodeURIComponent(deviceId)}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function getAdmsBiometricInventory(deviceId: string): Promise<AdmsBiometricInventoryResponse> {
  return readJson(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/biometric-inventory`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}
