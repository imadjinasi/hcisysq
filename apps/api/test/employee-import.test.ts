import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  EMPLOYEE_SOURCE_HEADERS,
  normalizeEmployeeImportRow,
  resolveDuplicateEmployeeNumbers,
} from "../src/modules/employees/domain/employee-import.js";
import { parseEmployeeCsv } from "../src/modules/employees/infrastructure/parse-employee-csv.js";
import { parseEmployeeWorkbook } from "../src/modules/employees/infrastructure/parse-employee-workbook.js";

function source(overrides: Record<string, unknown> = {}) {
  return {
    [EMPLOYEE_SOURCE_HEADERS.employeeNumber]: "YSQ-DEMO-001",
    [EMPLOYEE_SOURCE_HEADERS.fullName]: "Ahmad Demo",
    [EMPLOYEE_SOURCE_HEADERS.status]: "Aktif",
    [EMPLOYEE_SOURCE_HEADERS.unitName]: "Unit Demo",
    [EMPLOYEE_SOURCE_HEADERS.positionName]: "Guru Demo",
    [EMPLOYEE_SOURCE_HEADERS.email]: "ahmad.demo@example.test",
    [EMPLOYEE_SOURCE_HEADERS.startedOn]: "2026-01-01",
    ...overrides,
  };
}

describe("normalizeEmployeeImportRow", () => {
  it("keeps employee import independent from account creation when email is invalid", () => {
    const row = normalizeEmployeeImportRow(
      3,
      source({ [EMPLOYEE_SOURCE_HEADERS.email]: "belum-ada-email" }),
    );

    expect(row.candidate?.employeeNumber).toBe("YSQ-DEMO-001");
    expect(row.candidate?.email).toBeNull();
    expect(row.issues.map((issue) => issue.code)).toContain("invalid_email_ignored");
  });

  it("treats zero/Excel epoch exit date as empty instead of a historical date", () => {
    const zero = normalizeEmployeeImportRow(
      3,
      source({ [EMPLOYEE_SOURCE_HEADERS.endedOn]: "0" }),
    );
    const epoch = normalizeEmployeeImportRow(
      4,
      source({ [EMPLOYEE_SOURCE_HEADERS.endedOn]: new Date(1899, 11, 30) }),
    );

    expect(zero.candidate?.endedOn).toBeNull();
    expect(epoch.candidate?.endedOn).toBeNull();
    expect(zero.issues.map((issue) => issue.code)).not.toContain("invalid_date_ignored");
    expect(epoch.issues.map((issue) => issue.code)).not.toContain("invalid_date_ignored");
  });

  it("fails closed when status is unknown", () => {
    const row = normalizeEmployeeImportRow(
      3,
      source({ [EMPLOYEE_SOURCE_HEADERS.status]: "status-baru" }),
    );

    expect(row.candidate?.status).toBe("inactive");
    expect(row.issues.map((issue) => issue.code)).toContain(
      "unknown_status_defaulted_inactive",
    );
  });

  it("requires NIP when the row contains employee data", () => {
    const row = normalizeEmployeeImportRow(
      3,
      source({ [EMPLOYEE_SOURCE_HEADERS.employeeNumber]: "" }),
    );

    expect(row.candidate?.fullName).toBe("Ahmad Demo");
    expect(row.issues.map((issue) => issue.code)).toContain("missing_employee_number");
  });
});

describe("duplicate NIP resolution", () => {
  it("prefers active status before TMT, then skips superseded records", () => {
    const olderActive = normalizeEmployeeImportRow(
      3,
      source({
        [EMPLOYEE_SOURCE_HEADERS.fullName]: "Active Rehire",
        [EMPLOYEE_SOURCE_HEADERS.status]: "Aktif",
        [EMPLOYEE_SOURCE_HEADERS.startedOn]: "2024-01-01",
      }),
    );
    const newerResigned = normalizeEmployeeImportRow(
      4,
      source({
        [EMPLOYEE_SOURCE_HEADERS.fullName]: "Former Record",
        [EMPLOYEE_SOURCE_HEADERS.status]: "Keluar",
        [EMPLOYEE_SOURCE_HEADERS.startedOn]: "2025-01-01",
      }),
    );

    const rows = resolveDuplicateEmployeeNumbers([newerResigned, olderActive]);
    expect(rows.find((row) => row.rowNumber === 3)?.skip).not.toBe(true);
    expect(rows.find((row) => row.rowNumber === 4)?.skip).toBe(true);
  });

  it("uses the latest TMT when duplicate records have the same activity priority", () => {
    const older = normalizeEmployeeImportRow(3, source({ [EMPLOYEE_SOURCE_HEADERS.startedOn]: "2024-01-01" }));
    const newer = normalizeEmployeeImportRow(4, source({ [EMPLOYEE_SOURCE_HEADERS.startedOn]: "2026-01-01" }));

    const rows = resolveDuplicateEmployeeNumbers([older, newer]);
    expect(rows.find((row) => row.rowNumber === 3)?.skip).toBe(true);
    expect(rows.find((row) => row.rowNumber === 4)?.skip).not.toBe(true);
  });
});

describe("parseEmployeeWorkbook", () => {
  it("reads the supported master sheet and resolves duplicate NIP deterministically", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Master Data SDM YSQ");
    const headers = Object.values(EMPLOYEE_SOURCE_HEADERS);

    sheet.getRow(1).values = headers.map((_, index) => index + 1);
    sheet.getRow(2).values = headers;

    const rowA = source({ [EMPLOYEE_SOURCE_HEADERS.status]: "Keluar", [EMPLOYEE_SOURCE_HEADERS.startedOn]: "2024-01-01" });
    const rowB = source({ [EMPLOYEE_SOURCE_HEADERS.fullName]: "Pegawai Demo Direkrut Lagi", [EMPLOYEE_SOURCE_HEADERS.status]: "Aktif", [EMPLOYEE_SOURCE_HEADERS.startedOn]: "2026-01-01" });
    sheet.getRow(3).values = headers.map((header) => rowA[header] ?? null);
    sheet.getRow(4).values = headers.map((header) => rowB[header] ?? null);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const rows = await parseEmployeeWorkbook(buffer);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.skip).toBe(true);
    expect(rows[1]?.skip).not.toBe(true);
    expect(rows[1]?.issues.map((issue) => issue.code)).toContain(
      "duplicate_employee_number_selected",
    );
  });
});

describe("parseEmployeeCsv", () => {
  it("accepts UTF-8 CSV and semicolon-delimited exports", () => {
    const headers = Object.values(EMPLOYEE_SOURCE_HEADERS);
    const values = headers.map((header) => String(source()[header] ?? ""));
    const csv = `${headers.join(";")}\r\n${values.join(";")}\r\n`;

    const rows = parseEmployeeCsv(Buffer.from(csv, "utf8"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.candidate?.employeeNumber).toBe("YSQ-DEMO-001");
    expect(rows[0]?.candidate?.fullName).toBe("Ahmad Demo");
  });
});
