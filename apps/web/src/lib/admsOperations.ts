export type OperationsCapabilityState = "available" | "not_verified" | "blocked";
export type OperationsExecution = "device" | "hcis_only" | "blocked";

export interface OperationsCapability {
  key: string;
  label: string;
  state: OperationsCapabilityState;
  execution: OperationsExecution;
  reason: string;
}

export interface AdmsOperationsSummary {
  device: {
    id: string;
    serialNumber: string;
    displayName: string | null;
    lifecycle: "active" | "disabled" | "quarantined";
    timezone: string;
    model: string | null;
    firmwareVersion: string | null;
    lastSuccessfulRequestAt: string | null;
  };
  pendingCommandCount: number;
  rawPayloadExposed: false;
  arbitraryCommandEnabled: false;
  userInfoReadsRetired: true;
  destructiveExecutionEnabled: false;
  operationalRetention: {
    deletionEnabled: false;
    state: "policy_required";
    note: string;
  };
  capabilities: OperationsCapability[];
}

export interface AdmsWorkCodeItem {
  id: string;
  code: string;
  name: string;
  active: boolean;
  desiredState: "present" | "absent" | null;
  deliveryState: "not_verified" | "pending" | "succeeded" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface AdmsDeviceMessageItem {
  id: string;
  audience: "public" | "private";
  employeeId: string | null;
  employeeNumber: string | null;
  employeeName: string | null;
  title: string;
  messageText: string;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  desiredState: "present" | "absent" | null;
  deliveryState: "not_verified" | "pending" | "succeeded" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface AdmsOfflineImportItem {
  id: string;
  sourceFilename: string;
  parsedEventCount: number;
  insertedEventCount: number;
  duplicateEventCount: number;
  quarantineCount: number;
  createdAt: string;
}

export interface AdmsSavedFilter {
  id: string;
  deviceId: string | null;
  viewKey: "transactions" | "commands" | "logs";
  name: string;
  criteria: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (response.ok) return body as T;
  throw new Error((body as { message?: string } | null)?.message ?? "Operasional mesin tidak dapat diproses.");
}

export async function getAdmsOperations(deviceId: string) {
  const result = await readJson<{ item: AdmsOperationsSummary }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/operations`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
  return result.item;
}

export async function listAdmsWorkCodes(deviceId: string) {
  return readJson<{ deliveryCapability: "not_verified"; note: string; items: AdmsWorkCodeItem[] }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/work-codes`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function saveAdmsWorkCode(input: { code: string; name: string; active?: boolean }) {
  return readJson<{ item: AdmsWorkCodeItem }>(
    await fetch("/api/admin/attendance/adms/work-codes", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, active: input.active ?? true }),
    }),
  );
}

export async function setAdmsWorkCodeTarget(
  deviceId: string,
  workCodeId: string,
  desiredState: "present" | "absent",
) {
  return readJson<{ item: { desiredState: string; deliveryState: "not_verified" }; commandCreated: false }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/work-codes/${workCodeId}`, {
      method: "PUT",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ desiredState }),
    }),
  );
}

export async function listAdmsDeviceMessages(deviceId: string) {
  return readJson<{ deliveryCapability: "not_verified"; note: string; items: AdmsDeviceMessageItem[] }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/messages`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function createAdmsDeviceMessage(input: {
  audience: "public" | "private";
  employeeId?: string | null;
  title: string;
  messageText: string;
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  return readJson<{ item: AdmsDeviceMessageItem }>(
    await fetch("/api/admin/attendance/adms/messages", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, active: true }),
    }),
  );
}

export async function setAdmsDeviceMessageTarget(
  deviceId: string,
  messageId: string,
  desiredState: "present" | "absent",
) {
  return readJson<{ item: { desiredState: string; deliveryState: "not_verified" }; commandCreated: false }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/messages/${messageId}`, {
      method: "PUT",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ desiredState }),
    }),
  );
}

export async function clearAdmsPendingCommands(deviceId: string) {
  return readJson<{ cancelledCount: number; deliveredOrAcknowledgedCommandsUntouched: true }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/commands/clear-pending`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export function admsTransactionExportUrl(
  deviceId: string,
  filter?: { startAt?: string; endAt?: string; pin?: string },
) {
  const params = new URLSearchParams();
  if (filter?.startAt) params.set("startAt", filter.startAt);
  if (filter?.endAt) params.set("endAt", filter.endAt);
  if (filter?.pin) params.set("pin", filter.pin);
  const suffix = params.size ? `?${params}` : "";
  return `/api/admin/attendance/adms/devices/${deviceId}/transactions/export.csv${suffix}`;
}

export async function importAdmsOfflineAttlog(deviceId: string, file: File) {
  const content = await file.text();
  return readJson<{
    item: AdmsOfflineImportItem;
    projection: unknown[];
    deviceCommandsRequested: 0;
  }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/offline-attlog-imports`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, content }),
    }),
  );
}

export async function listAdmsOfflineImports(deviceId: string) {
  return readJson<{ items: AdmsOfflineImportItem[] }>(
    await fetch(`/api/admin/attendance/adms/devices/${deviceId}/offline-attlog-imports`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function listAdmsSavedFilters(input: {
  deviceId?: string;
  viewKey?: "transactions" | "commands" | "logs";
}) {
  const params = new URLSearchParams();
  if (input.deviceId) params.set("deviceId", input.deviceId);
  if (input.viewKey) params.set("viewKey", input.viewKey);
  const suffix = params.size ? `?${params}` : "";
  return readJson<{ items: AdmsSavedFilter[] }>(
    await fetch(`/api/admin/attendance/adms/saved-filters${suffix}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function saveAdmsFilter(input: {
  deviceId?: string | null;
  viewKey: "transactions" | "commands" | "logs";
  name: string;
  criteria: Record<string, unknown>;
}) {
  return readJson<{ item: AdmsSavedFilter }>(
    await fetch("/api/admin/attendance/adms/saved-filters", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteAdmsFilter(filterId: string) {
  const response = await fetch(`/api/admin/attendance/adms/saved-filters/${filterId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "Filter tersimpan tidak dapat dihapus.");
  }
}