import { AdminApiError } from "@/lib/adminEmployees";

export interface LeaveCalendarConfiguration {
  year: number;
  timezone: string;
  workingWeekdays: number[] | null;
  configured: boolean;
  exceptions: Array<{
    date: string;
    isWorkingDay: boolean;
    label: string | null;
    updatedAt: string;
  }>;
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
  const body = (await response.json().catch(() => null)) as
    | { code?: string; message?: string }
    | null;
  throw new AdminApiError(
    response.status,
    body?.code ?? "REQUEST_FAILED",
    body?.message ?? "Permintaan tidak dapat diproses.",
  );
}

export async function getLeaveCalendar(year?: number): Promise<LeaveCalendarConfiguration> {
  const suffix = year ? `?year=${year}` : "";
  return readJson(
    await fetch(`/api/admin/leave/calendar${suffix}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function updateLeaveWorkweek(workingWeekdays: number[]) {
  return readJson<{ workingWeekdays: number[] }>(
    await fetch("/api/admin/leave/calendar/workweek", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ workingWeekdays }),
    }),
  );
}

export async function upsertLeaveCalendarException(input: {
  date: string;
  isWorkingDay: boolean;
  label?: string | null;
}) {
  return readJson(
    await fetch(`/api/admin/leave/calendar/exceptions/${input.date}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        isWorkingDay: input.isWorkingDay,
        label: input.label ?? null,
      }),
    }),
  );
}

export async function deleteLeaveCalendarException(date: string) {
  await readJson<void>(
    await fetch(`/api/admin/leave/calendar/exceptions/${date}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    }),
  );
}
