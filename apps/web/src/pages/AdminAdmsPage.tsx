import { AlertTriangle, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminAdmsDeviceUserCorrection } from "@/components/attendance/AdminAdmsDeviceUserCorrection";
import { AdminAdmsMappingAssistant } from "@/components/attendance/AdminAdmsMappingAssistant";
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
            : "Daftar pegawai aktif tidak dapat dimuat untuk pencocokan PIN.",
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
      description="Pantau koneksi mesin, cocokkan PIN dengan pegawai HCIS, dan lakukan koreksi data pengguna dengan aman. Data absensi dari mesin tetap diperlakukan sebagai fakta waktu; halaman ini tidak menentukan telat, tidak hadir, lembur, atau potongan payroll."
    >
      {employeeError ? (
        <div className="mb-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {employeeError} Status mesin tetap dapat dilihat, tetapi PIN belum bisa dihubungkan ke pegawai baru sampai daftar pegawai tersedia.
        </div>
      ) : null}

      <AdminAdmsWave1Operations />
      <AdminAdmsDeviceUserCorrection />
      <AdminAdmsMappingAssistant />

      <details className="mt-5 rounded-2xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-sm font-bold text-brand-heading">
          <span>Alat diagnostik & pengaturan teknis</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </summary>
        <div className="border-t border-border/70 px-5 pb-5">
          <p className="pt-4 text-xs leading-5 text-muted-foreground">
            Bagian ini untuk troubleshooting dan verifikasi teknis. Admin operasional sehari-hari biasanya tidak perlu membukanya.
          </p>
          <AdminAdmsWave2UserInfoCanary />
          <AdminAdmsWave1Details />
          <AdminAdmsWave2ControlPlane />
          <AdminAdmsPanel employees={employees} />
        </div>
      </details>
    </AdminShell>
  );
}
