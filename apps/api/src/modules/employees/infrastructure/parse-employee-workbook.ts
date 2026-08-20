import ExcelJS from "exceljs";

import {
  EMPLOYEE_IMPORT_FIRST_DATA_ROW,
  EMPLOYEE_IMPORT_HEADER_ROW,
  EMPLOYEE_IMPORT_SHEET,
  EMPLOYEE_SOURCE_HEADERS,
  REQUIRED_EMPLOYEE_SOURCE_HEADERS,
  normalizeEmployeeImportRow,
  type NormalizedEmployeeImportRow,
} from "../domain/employee-import.js";

export class EmployeeWorkbookFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeWorkbookFormatError";
  }
}

function headerKey(value: string): string {
  return value.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ").toUpperCase();
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;

  if (typeof value === "object" && "result" in value && value.result instanceof Date) {
    return value.result;
  }

  // Keep identifiers/phone numbers as displayed text; never coerce them through JS numbers.
  return cell.text || null;
}

export async function parseEmployeeWorkbook(
  buffer: Buffer,
  options: { maxRows?: number } = {},
): Promise<NormalizedEmployeeImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.getWorksheet(EMPLOYEE_IMPORT_SHEET);
  if (!worksheet) {
    throw new EmployeeWorkbookFormatError(`Worksheet '${EMPLOYEE_IMPORT_SHEET}' tidak ditemukan.`);
  }

  const headers = new Map<string, number>();
  const headerRow = worksheet.getRow(EMPLOYEE_IMPORT_HEADER_ROW);
  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    headers.set(headerKey(cell.text), columnNumber);
  });

  const missingHeaders = REQUIRED_EMPLOYEE_SOURCE_HEADERS.filter(
    (header) => !headers.has(headerKey(header)),
  );
  if (missingHeaders.length > 0) {
    throw new EmployeeWorkbookFormatError(
      `Header wajib tidak ditemukan: ${missingHeaders.join(", ")}`,
    );
  }

  const maxRows = options.maxRows ?? 2_000;
  const rows: NormalizedEmployeeImportRow[] = [];
  const knownHeaders = Object.values(EMPLOYEE_SOURCE_HEADERS);

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < EMPLOYEE_IMPORT_FIRST_DATA_ROW) return;
    if (rows.length >= maxRows) {
      throw new EmployeeWorkbookFormatError(`Import melebihi batas ${maxRows} baris.`);
    }

    const source: Record<string, unknown> = {};
    for (const header of knownHeaders) {
      const columnNumber = headers.get(headerKey(header));
      if (columnNumber) source[header] = cellValue(row.getCell(columnNumber));
    }

    const normalized = normalizeEmployeeImportRow(rowNumber, source);
    if (normalized.candidate || normalized.issues.length > 0) rows.push(normalized);
  });

  const firstSeen = new Map<string, NormalizedEmployeeImportRow>();
  for (const row of rows) {
    const employeeNumber = row.candidate?.employeeNumber;
    if (!employeeNumber) continue;

    const previous = firstSeen.get(employeeNumber);
    if (!previous) {
      firstSeen.set(employeeNumber, row);
      continue;
    }

    const duplicateIssue = {
      severity: "error" as const,
      code: "duplicate_employee_number_in_file",
      field: "employeeNumber",
      message: "NIP muncul lebih dari sekali dalam workbook yang sama.",
    };
    row.issues.push(duplicateIssue);
    if (!previous.issues.some((issue) => issue.code === duplicateIssue.code)) {
      previous.issues.push(duplicateIssue);
    }
  }

  return rows;
}
