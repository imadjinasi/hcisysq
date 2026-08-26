import ExcelJS from "exceljs";

import {
  EMPLOYEE_IMPORT_FIRST_DATA_ROW,
  EMPLOYEE_IMPORT_HEADER_ROW,
  EMPLOYEE_IMPORT_SHEET,
  REQUIRED_EMPLOYEE_SOURCE_HEADERS,
  flagDuplicateEmployeeNumbers,
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

  if (typeof value === "object" && "result" in value) {
    const result = value.result;
    if (result instanceof Date) return result;
    if (typeof result === "string") return result;
    if (typeof result === "number") return cell.text || String(result);
  }

  if (typeof value === "string") return value;

  // Keep identifiers and phone numbers as displayed text; never coerce them through JS numbers.
  return cell.text || null;
}

export async function parseEmployeeWorkbook(
  buffer: Buffer,
  options: { maxRows?: number } = {},
): Promise<NormalizedEmployeeImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );

  const worksheet = workbook.getWorksheet(EMPLOYEE_IMPORT_SHEET);
  if (!worksheet) {
    throw new EmployeeWorkbookFormatError(`Worksheet '${EMPLOYEE_IMPORT_SHEET}' tidak ditemukan.`);
  }

  const headers = new Map<string, number>();
  const originalHeaders = new Map<string, string>();
  const headerRow = worksheet.getRow(EMPLOYEE_IMPORT_HEADER_ROW);
  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    headers.set(headerKey(cell.text), columnNumber);
    originalHeaders.set(headerKey(cell.text), cell.text);
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

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < EMPLOYEE_IMPORT_FIRST_DATA_ROW) return;
    if (rows.length >= maxRows) {
      throw new EmployeeWorkbookFormatError(`Import melebihi batas ${maxRows} baris.`);
    }

    const source: Record<string, unknown> = {};
    for (const [header, columnNumber] of headers) source[originalHeaders.get(header) ?? header] = cellValue(row.getCell(columnNumber));

    const normalized = normalizeEmployeeImportRow(rowNumber, source);
    if (normalized.candidate || normalized.issues.length > 0) rows.push(normalized);
  });

  return flagDuplicateEmployeeNumbers(rows);
}
