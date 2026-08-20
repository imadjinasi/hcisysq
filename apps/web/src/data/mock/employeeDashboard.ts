export const employeeDashboardMock = {
  user: {
    name: "Ahmad Fauzan",
    initials: "AF",
    position: "Kepala Unit",
    unit: "SMP Sabilul Qur'an",
    employeeId: "YSQ-DEMO-0142",
    additionalRole: "Kepala Unit SMP",
  },
  attendance: {
    state: "Hadir",
    checkIn: "07.24",
    schedule: "07.30–16.00",
    note: "Tepat waktu",
  },
  leave: {
    remaining: 8,
    total: 12,
    used: 4,
  },
  activeRequests: 1,
  payslip: {
    period: "Juli 2026",
    available: true,
    source: "Impor payroll",
    importedAt: "5 Agustus 2026",
  },
  approvals: {
    total: 2,
    items: [
      { id: "apr-001", name: "Nabila Rahma", type: "Cuti tahunan", age: "2 jam" },
      { id: "apr-002", name: "Salsabila Nur", type: "Izin datang terlambat", age: "1 hari" },
    ],
  },
  requests: [
    {
      id: "req-001",
      type: "Cuti Tahunan",
      detail: "25–26 Agustus 2026 · 2 hari",
      status: "Menunggu atasan",
      tone: "pending" as const,
    },
    {
      id: "req-002",
      type: "Izin Kehadiran",
      detail: "18 Agustus 2026 · Datang terlambat",
      status: "Disetujui",
      tone: "approved" as const,
    },
  ],
} as const;
