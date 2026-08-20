import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  EMPLOYEE_SOURCE_HEADERS,
  normalizeEmployeeImportRow,
} from "../src/modules/employees/domain/employee-import.js";
import { parseEmployeeWorkbook } from "../src/modules/employees/infrastructure/parse-employee-workbook.js";

function source(overrides: Record<string, unknown> = {}) {
  return {
    [EMPLOYEE_SOURCE_HEADERS.employeeNumber]: "YSQ-DEMO-001",
    [EMPLOYEE_SOURCE_HEADERS.fullName]: "Ahmad Demo",
    [EMPLOYEE_SOURCE_HEADERS.status]: "Aktif",
    [EMPLOYEE_SOURCE_HEADERS.unitName]: "Unit Demo",
    [EMPLOYEE_SOURCE_HEADERS.positionName]: "Guru Demo",
    [EMPLOYEE_SOURCE_HEADERS.email]: "ahmad.demo@example.test",
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

describe("parseEmployeeWorkbook", () => {
  it("reads only the supported master sheet and flags duplicate NIP", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Master Data SDM YSQ");
    const headers = Object.values(EMPLOYEE_SOURCE_HEADERS);

    sheet.getRow(1).values = headers.map((_, index) => index + 1);
    sheet.getRow(2).values = headers;

    const rowA = source();
    const rowB = source({ [EMPLOYEE_SOURCE_HEADERS.fullName]: "Pegawai Demo Kedua" });
    sheet.getRow(3).values = headers.map((header) => rowA[header] ?? null);
    sheet.getRow(4).values = headers.map((header) => rowB[header] ?? null);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const rows = await parseEmployeeWorkbook(buffer);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.issues.map((issue) => issue.code)).toContain(
      "duplicate_employee_number_in_file",
    );
    expect(rows[1]?.issues.map((issue) => issue.code)).toContain(
      "duplicate_employee_number_in_file",
    );
  });
});
