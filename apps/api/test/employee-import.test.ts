import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  EMPLOYEE_SOURCE_HEADERS,
  flagDuplicateEmployeeNumbers,
  normalizeEmployeeImportRow,
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

  it("treats source exit-date sentinels as empty instead of historical dates", () => {
    const values = ["0", "00:00:00", "30 Desember 1899", new Date(1899, 11, 30)];

    for (const [index, value] of values.entries()) {
      const row = normalizeEmployeeImportRow(
        index + 3,
        source({ [EMPLOYEE_SOURCE_HEADERS.endedOn]: value }),
      );
      expect(row.candidate?.endedOn).toBeNull();
      expect(row.issues.map((issue) => issue.code)).not.toContain("invalid_date_ignored");
    }
  });

  it("accepts Indonesian display dates exported by Google Sheets CSV", () => {
    const row = normalizeEmployeeImportRow(
      3,
      source({
        [EMPLOYEE_SOURCE_HEADERS.startedOn]: "01 September 2026",
        [EMPLOYEE_SOURCE_HEADERS.endedOn]: "31 Mei 2027",
      }),
    );

    expect(row.candidate?.startedOn).toBe("2026-09-01");
    expect(row.candidate?.endedOn).toBe("2027-05-31");
    expect(row.issues.map((issue) => issue.code)).not.toContain("invalid_date_ignored");
  });

  it("reports spreadsheet formula errors in NIP explicitly", () => {
    const row = normalizeEmployeeImportRow(
      3,
      source({ [EMPLOYEE_SOURCE_HEADERS.employeeNumber]: "#VALUE!" }),
    );

    expect(row.candidate?.employeeNumber).toBe("");
    expect(row.issues.map((issue) => issue.code)).toContain(
      "invalid_employee_number_source_error",
    );
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

describe("duplicate NIP validation", () => {
  it("blocks both rows when a real duplicate NIP exists", () => {
    const first = normalizeEmployeeImportRow(3, source());
    const second = normalizeEmployeeImportRow(
      4,
      source({ [EMPLOYEE_SOURCE_HEADERS.fullName]: "Pegawai Demo Kedua" }),
    );

    const rows = flagDuplicateEmployeeNumbers([first, second]);
    expect(rows[0]?.issues.map((issue) => issue.code)).toContain(
      "duplicate_employee_number_in_file",
    );
    expect(rows[1]?.issues.map((issue) => issue.code)).toContain(
      "duplicate_employee_number_in_file",
    );
  });
});

describe("parseEmployeeWorkbook", () => {
  it("preserves unique long NIP values including a cached formula result", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Master Data SDM YSQ");
    const headers = Object.values(EMPLOYEE_SOURCE_HEADERS);

    sheet.getRow(1).values = headers.map((_, index) => index + 1);
    sheet.getRow(2).values = headers;

    const rows = [
      source({ [EMPLOYEE_SOURCE_HEADERS.employeeNumber]: "209901199001011901" }),
      source({
        [EMPLOYEE_SOURCE_HEADERS.employeeNumber]: "209902199002022902",
        [EMPLOYEE_SOURCE_HEADERS.fullName]: "Pegawai Demo Dua",
      }),
      source({
        [EMPLOYEE_SOURCE_HEADERS.employeeNumber]: "209903199003033903",
        [EMPLOYEE_SOURCE_HEADERS.fullName]: "Pegawai Demo Tiga",
      }),
    ];

    rows.forEach((row, index) => {
      sheet.getRow(index + 3).values = headers.map((header) => row[header] ?? null);
    });
    sheet.getCell("A3").value = {
      formula: '"209901199001011901"',
      result: "209901199001011901",
    };

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseEmployeeWorkbook(buffer);

    expect(parsed).toHaveLength(3);
    expect(parsed.map((row) => row.candidate?.employeeNumber)).toEqual([
      "209901199001011901",
      "209902199002022902",
      "209903199003033903",
    ]);
    expect(
      parsed.flatMap((row) => row.issues).some(
        (issue) => issue.code === "duplicate_employee_number_in_file",
      ),
    ).toBe(false);
  });

  it("still blocks a genuine duplicate NIP in XLSX", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Master Data SDM YSQ");
    const headers = Object.values(EMPLOYEE_SOURCE_HEADERS);

    sheet.getRow(1).values = headers.map((_, index) => index + 1);
    sheet.getRow(2).values = headers;
    sheet.getRow(3).values = headers.map((header) => source()[header] ?? null);
    sheet.getRow(4).values = headers.map(
      (header) =>
        source({ [EMPLOYEE_SOURCE_HEADERS.fullName]: "Pegawai Demo Kedua" })[header] ?? null,
    );

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseEmployeeWorkbook(buffer);

    expect(parsed[0]?.issues.map((issue) => issue.code)).toContain(
      "duplicate_employee_number_in_file",
    );
    expect(parsed[1]?.issues.map((issue) => issue.code)).toContain(
      "duplicate_employee_number_in_file",
    );
  });
});

describe("parseEmployeeCsv", () => {
  it("detects the current Google Sheets header on row 2 and normalizes display dates", () => {
    const headers = Object.values(EMPLOYEE_SOURCE_HEADERS);
    const values = headers.map((header) => {
      if (header === EMPLOYEE_SOURCE_HEADERS.startedOn) return "01 September 2026";
      if (header === EMPLOYEE_SOURCE_HEADERS.endedOn) return "30 Desember 1899";
      return String(source()[header] ?? "");
    });
    const numberingRow = headers.map((_, index) => String(index + 1));
    const csv = `${numberingRow.join(",")}\r\n${headers.join(",")}\r\n${values.join(",")}\r\n`;

    const rows = parseEmployeeCsv(Buffer.from(csv, "utf8"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rowNumber).toBe(3);
    expect(rows[0]?.candidate?.employeeNumber).toBe("YSQ-DEMO-001");
    expect(rows[0]?.candidate?.startedOn).toBe("2026-09-01");
    expect(rows[0]?.candidate?.endedOn).toBeNull();
  });

  it("accepts semicolon-delimited CSV exports", () => {
    const headers = Object.values(EMPLOYEE_SOURCE_HEADERS);
    const values = headers.map((header) => String(source()[header] ?? ""));
    const csv = `${headers.join(";")}\r\n${values.join(";")}\r\n`;

    const rows = parseEmployeeCsv(Buffer.from(csv, "utf8"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.candidate?.employeeNumber).toBe("YSQ-DEMO-001");
  });

  it("retains an unmodeled source column with its original spelling", () => {
    const headers = [...Object.values(EMPLOYEE_SOURCE_HEADERS), "Catatan HR Rahasia"];
    const values = [...headers.slice(0, -1).map((header) => String(source()[header] ?? "")), "perlu review"];
    const rows = parseEmployeeCsv(Buffer.from(`${headers.join(",")}\n${values.join(",")}\n`, "utf8"));
    expect(rows[0]?.candidate?.sourceData["Catatan HR Rahasia"]).toBe("perlu review");
  });

  it("records canonical column presence separately from an explicit empty value", () => {
    const row = normalizeEmployeeImportRow(3, {
      [EMPLOYEE_SOURCE_HEADERS.employeeNumber]: "YSQ-DEMO-001",
      [EMPLOYEE_SOURCE_HEADERS.fullName]: "Ahmad Demo",
      [EMPLOYEE_SOURCE_HEADERS.status]: "Aktif",
      [EMPLOYEE_SOURCE_HEADERS.phone]: "",
    });
    expect(row.candidate?.presentFields).toContain("phone");
    expect(row.candidate?.presentFields).not.toContain("education");
    expect(row.candidate?.phone).toBeNull();
  });
});
