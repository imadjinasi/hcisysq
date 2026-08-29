import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminAdmsPanel } from "@/components/attendance/AdminAdmsPanel";
import { AdminAdmsWave1Details } from "@/components/attendance/AdminAdmsWave1Details";
import { AdminAdmsWave1Operations } from "@/components/attendance/AdminAdmsWave1Operations";
import { AdminAdmsWave2ControlPlane } from "@/components/attendance/AdminAdmsWave2ControlPlane";
import { AdminAdmsWave2UserInfoCanary } from "@/components/attendance/AdminAdmsWave2UserInfoCanary";
import { AdminShell } from "@/layouts/AdminShell";
import {
  AdminApiError,
  listEmployees,
  type AdminEmployeeListItem,
} from "@/lib/adminEmployees";

async function loadAllActiveEmployees(): Promise<AdminEmployeeListItem[]> {
  const first = await listEmployees({ page: 1, pageSize: 100, status: "active" });
  if (first.pagination.pageCount <= 1) return first.items;
  const rest = await Promise.all(
    Array.from({ length: first.pagination.pageCount - 1 }, (_, index) =>
      listEmployees({ page: index + 2, pageSize: 100, status: "active" }),
    ),
  );
  return [first, ...rest].flatMap((page) => page.items);
}

export function AdminAdmsPage() {
  const [employees, setEmployees] = useState<AdminEmployeeListItem[]>([]);
  const [employeeError, setEmployeeError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadAllActiveEmployees()
      .then((items) => {
        if (!mounted) return;
        setEmployees(items);
        setEmployeeError(null);
      })
      .catch((cause: unknown) => {
        if (!mounted) return;
        setEmployeeError(
          cause instanceof AdminApiError
            ? cause.message
            : "Daftar pegawai aktif tidak dapat dimuat untuk mapping PIN.",
        );
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AdminShell
      active="attendance-devices"
      title="Mesin Fingerprint"
      description="Kelola connectivity, recovery transaksi, command, device roster, biometric control plane, registry ADMS, mapping PIN pegawai, raw punch, dan quarantine. Lifecycle mesin tidak sama dengan status online; semua punch tetap fakta waktu tanpa inferensi telat, absen, lembur, atau payroll."
    >
      {employeeError ? (
        <div className="mb-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {employeeError} Registry dan observability tetap dapat digunakan, tetapi mapping baru dinonaktifkan sampai daftar pegawai tersedia.
        </div>
      ) : null}
      <AdminAdmsWave1Operations />
      <AdminAdmsWave1Details />
      <AdminAdmsWave2UserInfoCanary />
      <AdminAdmsWave2ControlPlane />
      <AdminAdmsPanel employees={employees} />
    </AdminShell>
  );
}
