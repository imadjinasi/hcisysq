import type { EmployeeStatus } from "./adminEmployees";

export function employeeLifecycleLabel(status: EmployeeStatus, removedAt: string | null) {
  if (removedAt) return "Dikeluarkan dari HCIS";
  if (status === "active") return "Aktif";
  if (status === "resigned") return "Keluar";
  return "Tidak aktif";
}
