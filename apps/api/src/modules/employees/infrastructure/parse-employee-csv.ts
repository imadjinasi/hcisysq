import {
  EMPLOYEE_SOURCE_HEADERS,
  REQUIRED_EMPLOYEE_SOURCE_HEADERS,
  flagDuplicateEmployeeNumbers,
  normalizeEmployeeImportRow,
  type NormalizedEmployeeImportRow,
} from "../domain/employee-import.js";

export class EmployeeCsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeCsvFormatError";
  }
}

function headerKey(value: string): string {
  return value.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ").toUpperCase();
}

function detectDelimiter(text: string): "," | ";" {
  let comma = 0;
  let semicolon = 0;
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === "\n" || char === "\r") break;
    if (char === ",") comma += 1;
    if (char === ";") semicolon += 1;
  }

  return semicolon > comma ? ";" : ",";
}

function parseRecords(text: string, delimiter: "," | ";"): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushRow = () => {
    row.push(field);
    field = "";
    if (row.some((value) => value.trim() !== "")) records.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      pushRow();
      continue;
    }
    if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      pushRow();
      continue;
    }
    field += char;
  }

  if (inQuotes) {
    throw new EmployeeCsvFormatError("CSV memiliki quoted field yang tidak ditutup.");
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return records;
}

function findHeaderRecord(records: string[][]): {
  headerIndex: number;
  headers: Map<string, number>;
} {
  const scanLimit = Math.min(records.length, 10);

  for (let headerIndex = 0; headerIndex < scanLimit; headerIndex += 1) {
    const candidate = records[headerIndex]!;
    const headers = new Map<string, number>();
    candidate.forEach((value, index) => headers.set(headerKey(value), index));

    const complete = REQUIRED_EMPLOYEE_SOURCE_HEADERS.every((name) =>
      headers.has(headerKey(name)),
    );
    if (complete) return { headerIndex, headers };
  }

  throw new EmployeeCsvFormatError(
    `Header wajib tidak ditemukan pada 10 baris pertama: ${REQUIRED_EMPLOYEE_SOURCE_HEADERS.join(", ")}`,
  );
}

export function parseEmployeeCsv(
  buffer: Buffer,
  options: { maxRows?: number } = {},
): NormalizedEmployeeImportRow[] {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (!text.trim()) throw new EmployeeCsvFormatError("CSV kosong.");

  const delimiter = detectDelimiter(text);
  const records = parseRecords(text, delimiter);
  const { headerIndex, headers } = findHeaderRecord(records);

  const maxRows = options.maxRows ?? 2_000;
  const rows: NormalizedEmployeeImportRow[] = [];
  const knownHeaders = Object.values(EMPLOYEE_SOURCE_HEADERS);

  for (let recordIndex = headerIndex + 1; recordIndex < records.length; recordIndex += 1) {
    if (rows.length >= maxRows) {
      throw new EmployeeCsvFormatError(`Import melebihi batas ${maxRows} baris.`);
    }

    const record = records[recordIndex]!;
    const source: Record<string, unknown> = {};
    for (const name of knownHeaders) {
      const column = headers.get(headerKey(name));
      if (column !== undefined) source[name] = record[column] ?? "";
    }

    const normalized = normalizeEmployeeImportRow(recordIndex + 1, source);
    if (normalized.candidate || normalized.issues.length > 0) rows.push(normalized);
  }

  return flagDuplicateEmployeeNumbers(rows);
}
