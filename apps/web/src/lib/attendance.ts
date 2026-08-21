export interface AttendanceEmployee {
  id: string;
  employeeNumber: string;
  fullName: string;
  status: "active" | "inactive" | "resigned";
  unitName: string | null;
  positionName: string | null;
}

export interface AttendanceRecord {
  employeeId: string;
  attendanceDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  source: "manual" | "integration";
  createdAt: string;
  updatedAt: string;
}

export interface AdminAttendanceRecord extends AttendanceRecord {
  sourceReference: string | null;
  note: string | null;
}

export interface AttendanceListResponse {
  referenceDate?: string;
  range: {
    from: string;
    to: string;
  };
  employee: AttendanceEmployee;
  items: AttendanceRecord[];
}

export interface AdminAttendanceListResponse
  extends Omit<AttendanceListResponse, "items" | "referenceDate"> {
  items: AdminAttendanceRecord[];
}

export class AttendanceApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AttendanceApiError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | T
    | { code?: string; message?: string }
    | null;
  if (response.ok) return body as T;
  const error = body as { code?: string; message?: string } | null;
  throw new AttendanceApiError(
    response.status,
    error?.code ?? "ATTENDANCE_REQUEST_FAILED",
    error?.message ?? "Data kehadiran tidak dapat diproses.",
  );
}

function rangeParams(input: { from?: string; to?: string } = {}) {
  const params = new URLSearchParams();
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getMyAttendance(
  input: { from?: string; to?: string } = {},
): Promise<AttendanceListResponse> {
  return readJson(
    await fetch(`/api/attendance/me${rangeParams(input)}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function getAdminEmployeeAttendance(
  employeeId: string,
  input: { from?: string; to?: string } = {},
): Promise<AdminAttendanceListResponse> {
  return readJson(
    await fetch(`/api/admin/attendance/employees/${employeeId}${rangeParams(input)}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function saveAdminAttendanceRecord(
  employeeId: string,
  attendanceDate: string,
  input: {
    checkInAt: string | null;
    checkOutAt: string | null;
    note: string | null;
  },
): Promise<{ item: AdminAttendanceRecord }> {
  return readJson(
    await fetch(`/api/admin/attendance/employees/${employeeId}/${attendanceDate}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteAdminAttendanceRecord(
  employeeId: string,
  attendanceDate: string,
): Promise<void> {
  const response = await fetch(
    `/api/admin/attendance/employees/${employeeId}/${attendanceDate}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (response.ok) return;
  await readJson<never>(response);
}
