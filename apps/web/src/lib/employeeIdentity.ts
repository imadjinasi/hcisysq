import type { EmployeeLeaveSummary } from "@/lib/employeeLeave";

export function employeeShellUser(employee: EmployeeLeaveSummary["employee"] | null) {
  const name = employee?.fullName ?? "Pegawai";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return {
    name,
    initials,
    position: employee?.positionName ?? "Pegawai",
    unit: employee?.unitName ?? "Yayasan Sabilul Qur'an",
  };
}
