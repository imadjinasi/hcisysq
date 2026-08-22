import {
  AttendanceResolutionApiError,
  getHcAdministrationQueue,
  getHcAttendanceResolutionQueue,
  type HcAdministrationQueue,
  type HcAttendanceResolutionQueue,
} from "@/lib/attendanceResolution";

export type HcQueueState<T> =
  | { status: "loading" }
  | { status: "ready"; queue: T }
  | { status: "error"; message: string };

async function resolveHcQueue<T>(
  loader: () => Promise<T>,
  fallbackMessage: string,
): Promise<Exclude<HcQueueState<T>, { status: "loading" }>> {
  try {
    return { status: "ready", queue: await loader() };
  } catch (cause) {
    return {
      status: "error",
      message:
        cause instanceof AttendanceResolutionApiError
          ? cause.message
          : fallbackMessage,
    };
  }
}

export function resolveHcAdministrationQueue(
  loader: () => Promise<HcAdministrationQueue> = getHcAdministrationQueue,
) {
  return resolveHcQueue(loader, "Antrean validasi Human Capital tidak dapat dimuat.");
}

export function resolveHcAttendanceQueue(
  loader: () => Promise<HcAttendanceResolutionQueue> = getHcAttendanceResolutionQueue,
) {
  return resolveHcQueue(loader, "Antrean penyelesaian ketidakhadiran tidak dapat dimuat.");
}
