export const EMPLOYEE_IMPORT_SHEET = "Master Data SDM YSQ";
export const EMPLOYEE_IMPORT_HEADER_ROW = 2;
export const EMPLOYEE_IMPORT_FIRST_DATA_ROW = 3;
export const EMPLOYEE_IMPORT_CSV_SOURCE = "CSV";

export const EMPLOYEE_SOURCE_HEADERS = {
  employeeNumber: "NIP",
  fullName: "NAMA",
  status: "STATUS AKTIF",
  employmentStatus: "STATUS KEPEGAWAIAN",
  unitName: "UNIT",
  positionName: "JABATAN",
  employmentType: "JENIS KEPEGAWAIAN",
  functionalPosition: "JABATAN FUNGSIONAL",
  structuralPosition: "JABATAN STRUKTURAL",
  email: "EMAIL",
  phone: "NO HP",
  education: "PENDIDIKAN TERAKHIR",
  startedOn: "TMT",
  endedOn: "TAHUN KELUAR (TTTT-BB)",
} as const;

export const REQUIRED_EMPLOYEE_SOURCE_HEADERS = [
  EMPLOYEE_SOURCE_HEADERS.employeeNumber,
  EMPLOYEE_SOURCE_HEADERS.fullName,
  EMPLOYEE_SOURCE_HEADERS.status,
] as const;

export type EmployeeStatus = "active" | "inactive" | "resigned";
export type ImportSeverity = "warning" | "error";
export type ImportAction = "insert" | "update" | "error" | "skip";

export interface ImportIssue {
  severity: ImportSeverity;
  code: string;
  field: string | null;
  message: string;
}

export interface EmployeeImportCandidate {
  employeeNumber: string;
  fullName: string;
  status: EmployeeStatus;
  employmentStatus: string | null;
  unitName: string | null;
  positionName: string | null;
  employmentType: string | null;
  functionalPosition: string | null;
  structuralPosition: string | null;
  email: string | null;
  phone: string | null;
  education: string | null;
  startedOn: string | null;
  endedOn: string | null;
}

export interface NormalizedEmployeeImportRow {
  rowNumber: number;
  candidate: EmployeeImportCandidate | null;
  issues: ImportIssue[];
  skip?: boolean;
}

export interface PlannedEmployeeImportRow extends NormalizedEmployeeImportRow {
  action: ImportAction;
}

export interface EmployeeImportSummary {
  importId: string;
  sourceFilename: string;
  sourceSheet: string;
  checksumSha256: string;
  rowCount: number;
  insertCount: number;
  updateCount: number;
  warningCount: number;
  errorCount: number;
  status: "previewed" | "committed" | "failed";
  createdAt: string;
  committedAt: string | null;
}

export interface EmployeeImportPreview extends EmployeeImportSummary {
  rows: Array<{
    rowNumber: number;
    action: ImportAction;
    issues: ImportIssue[];
  }>;
}

export interface EmployeeImportCommitResult extends EmployeeImportSummary {
  committedCount: number;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").trim();
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized || normalized === "-") return null;
  return normalized;
}

function normalizeEmail(value: unknown): { value: string | null; warning: ImportIssue | null } {
  const normalized = nullableText(value)?.toLowerCase() ?? null;
  if (!normalized) return { value: null, warning: null };

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (valid) return { value: normalized, warning: null };

  return {
    value: null,
    warning: {
      severity: "warning",
      code: "invalid_email_ignored",
      field: "email",
      message: "Email tidak valid dan diabaikan; employee tetap dapat diimpor dan email dapat dikoreksi manual setelah konfirmasi.",
    },
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isEmptyDateSentinel(value: unknown): boolean {
  if (value === 0) return true;
  const raw = text(value).toLowerCase();
  return raw === "0" || raw === "0.0" || raw === "00" || raw === "n/a" || raw === "na";
}

function normalizeDate(
  value: unknown,
  field: "startedOn" | "endedOn",
): { value: string | null; warning: ImportIssue | null } {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "-" ||
    isEmptyDateSentinel(value)
  ) {
    return { value: null, warning: null };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Excel serial 0 / empty date sentinels can surface around the 1899/1900 epoch.
    if (value.getFullYear() <= 1900) return { value: null, warning: null };
    return {
      value: `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`,
      warning: null,
    };
  }

  const raw = text(value);
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (
    isoDate &&
    isValidDateParts(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]))
  ) {
    return { value: raw, warning: null };
  }

  const monthOnly = /^(\d{4})-(\d{2})$/.exec(raw);
  if (monthOnly && Number(monthOnly[2]) >= 1 && Number(monthOnly[2]) <= 12) {
    return {
      value: `${monthOnly[1]}-${monthOnly[2]}-01`,
      warning: {
        severity: "warning",
        code: "month_only_date_normalized",
        field,
        message: "Tanggal hanya berisi tahun-bulan dan dinormalisasi ke hari pertama bulan tersebut.",
      },
    };
  }

  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (
    dayFirst &&
    isValidDateParts(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]))
  ) {
    return {
      value: `${dayFirst[3]}-${pad2(Number(dayFirst[2]))}-${pad2(Number(dayFirst[1]))}`,
      warning: {
        severity: "warning",
        code: "date_format_normalized",
        field,
        message: "Format tanggal dinormalisasi ke YYYY-MM-DD.",
      },
    };
  }

  return {
    value: null,
    warning: {
      severity: "warning",
      code: "invalid_date_ignored",
      field,
      message: "Tanggal tidak dikenali dan diabaikan untuk import ini.",
    },
  };
}

function normalizeStatus(value: unknown): { value: EmployeeStatus; warning: ImportIssue | null } {
  const raw = text(value).toLowerCase().replace(/\s+/g, " ");

  if (raw.includes("resign") || raw.includes("keluar")) {
    return { value: "resigned", warning: null };
  }

  if (raw.includes("tidak aktif") || raw.includes("nonaktif") || raw.includes("non aktif")) {
    return { value: "inactive", warning: null };
  }

  if (raw === "aktif" || raw.startsWith("aktif ")) {
    return { value: "active", warning: null };
  }

  return {
    value: "inactive",
    warning: {
      severity: "warning",
      code: "unknown_status_defaulted_inactive",
      field: "status",
      message: "Status pegawai tidak dikenali dan dinormalisasi menjadi inactive agar akses gagal tertutup.",
    },
  };
}

export function normalizeEmployeeImportRow(
  rowNumber: number,
  source: Record<string, unknown>,
): NormalizedEmployeeImportRow {
  const issues: ImportIssue[] = [];
  const employeeNumber = text(source[EMPLOYEE_SOURCE_HEADERS.employeeNumber]);
  const fullName = text(source[EMPLOYEE_SOURCE_HEADERS.fullName]);

  if (!employeeNumber && !fullName) {
    return { rowNumber, candidate: null, issues };
  }

  if (!employeeNumber) {
    issues.push({
      severity: "error",
      code: "missing_employee_number",
      field: "employeeNumber",
      message: "NIP wajib diisi.",
    });
  }

  if (!fullName) {
    issues.push({
      severity: "error",
      code: "missing_full_name",
      field: "fullName",
      message: "Nama pegawai wajib diisi.",
    });
  }

  const status = normalizeStatus(source[EMPLOYEE_SOURCE_HEADERS.status]);
  if (status.warning) issues.push(status.warning);

  const email = normalizeEmail(source[EMPLOYEE_SOURCE_HEADERS.email]);
  if (email.warning) issues.push(email.warning);

  const startedOn = normalizeDate(source[EMPLOYEE_SOURCE_HEADERS.startedOn], "startedOn");
  if (startedOn.warning) issues.push(startedOn.warning);

  const endedOn = normalizeDate(source[EMPLOYEE_SOURCE_HEADERS.endedOn], "endedOn");
  if (endedOn.warning) issues.push(endedOn.warning);

  const unitName = nullableText(source[EMPLOYEE_SOURCE_HEADERS.unitName]);
  if (!unitName) {
    issues.push({
      severity: "warning",
      code: "missing_unit",
      field: "unitName",
      message: "Unit belum terisi; reporting hierarchy perlu dilengkapi sebelum approval digunakan.",
    });
  }

  const positionName = nullableText(source[EMPLOYEE_SOURCE_HEADERS.positionName]);
  if (!positionName) {
    issues.push({
      severity: "warning",
      code: "missing_position",
      field: "positionName",
      message: "Jabatan belum terisi.",
    });
  }

  return {
    rowNumber,
    candidate: {
      employeeNumber,
      fullName,
      status: status.value,
      employmentStatus: nullableText(source[EMPLOYEE_SOURCE_HEADERS.employmentStatus]),
      unitName,
      positionName,
      employmentType: nullableText(source[EMPLOYEE_SOURCE_HEADERS.employmentType]),
      functionalPosition: nullableText(source[EMPLOYEE_SOURCE_HEADERS.functionalPosition]),
      structuralPosition: nullableText(source[EMPLOYEE_SOURCE_HEADERS.structuralPosition]),
      email: email.value,
      phone: nullableText(source[EMPLOYEE_SOURCE_HEADERS.phone]),
      education: nullableText(source[EMPLOYEE_SOURCE_HEADERS.education]),
      startedOn: startedOn.value,
      endedOn: endedOn.value,
    },
    issues,
  };
}

function hasBlockingIssue(row: NormalizedEmployeeImportRow): boolean {
  return row.issues.some((issue) => issue.severity === "error");
}

function compareDuplicateCandidates(
  left: NormalizedEmployeeImportRow,
  right: NormalizedEmployeeImportRow,
): number {
  const leftValid = hasBlockingIssue(left) ? 0 : 1;
  const rightValid = hasBlockingIssue(right) ? 0 : 1;
  if (leftValid !== rightValid) return rightValid - leftValid;

  const leftActive = left.candidate?.status === "active" ? 1 : 0;
  const rightActive = right.candidate?.status === "active" ? 1 : 0;
  if (leftActive !== rightActive) return rightActive - leftActive;

  const leftTmt = left.candidate?.startedOn ?? "";
  const rightTmt = right.candidate?.startedOn ?? "";
  if (leftTmt !== rightTmt) return rightTmt.localeCompare(leftTmt);

  return right.rowNumber - left.rowNumber;
}

export function resolveDuplicateEmployeeNumbers(
  rows: NormalizedEmployeeImportRow[],
): NormalizedEmployeeImportRow[] {
  const groups = new Map<string, NormalizedEmployeeImportRow[]>();
  for (const row of rows) {
    const employeeNumber = row.candidate?.employeeNumber;
    if (!employeeNumber) continue;
    const group = groups.get(employeeNumber) ?? [];
    group.push(row);
    groups.set(employeeNumber, group);
  }

  for (const [employeeNumber, group] of groups) {
    if (group.length < 2) continue;
    const ranked = [...group].sort(compareDuplicateCandidates);
    const winner = ranked[0]!;
    winner.issues.push({
      severity: "warning",
      code: "duplicate_employee_number_selected",
      field: "employeeNumber",
      message: `NIP ${employeeNumber} muncul ${group.length} kali; record ini dipilih sebagai kondisi terkini (valid > aktif > TMT terbaru > baris terakhir).`,
    });

    for (const row of ranked.slice(1)) {
      row.skip = true;
      row.issues.push({
        severity: "warning",
        code: "duplicate_employee_number_superseded",
        field: "employeeNumber",
        message: "Record NIP yang sama dilewati karena ada record yang lebih diprioritaskan sebagai kondisi pegawai terkini.",
      });
    }
  }

  return rows;
}

export function normalizeReferenceName(value: string): string {
  return value.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ").toLowerCase();
}
