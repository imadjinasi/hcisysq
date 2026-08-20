import { createHash } from "node:crypto";

import {
  EMPLOYEE_IMPORT_SHEET,
  type EmployeeImportCommitResult,
  type EmployeeImportPreview,
  type PlannedEmployeeImportRow,
} from "../domain/employee-import.js";
import { parseEmployeeWorkbook } from "../infrastructure/parse-employee-workbook.js";
import type { EmployeeImportStore } from "./employee-import-store.js";

export class EmployeeImportService {
  constructor(private readonly store: EmployeeImportStore) {}

  async preview(input: { filename: string; buffer: Buffer }): Promise<EmployeeImportPreview> {
    const parsedRows = await parseEmployeeWorkbook(input.buffer);
    const employeeNumbers = parsedRows
      .map((row) => row.candidate?.employeeNumber ?? null)
      .filter((value): value is string => Boolean(value));
    const existing = await this.store.findExistingEmployeeNumbers(employeeNumbers);

    const plannedRows: PlannedEmployeeImportRow[] = parsedRows.map((row) => {
      const hasError = row.issues.some((issue) => issue.severity === "error");
      if (hasError || !row.candidate) return { ...row, action: "error" };

      return {
        ...row,
        action: existing.has(row.candidate.employeeNumber) ? "update" : "insert",
      };
    });

    return this.store.savePreview({
      sourceFilename: input.filename,
      sourceSheet: EMPLOYEE_IMPORT_SHEET,
      checksumSha256: createHash("sha256").update(input.buffer).digest("hex"),
      rows: plannedRows,
    });
  }

  getPreview(importId: string): Promise<EmployeeImportPreview | null> {
    return this.store.getPreview(importId);
  }

  commit(importId: string): Promise<EmployeeImportCommitResult> {
    return this.store.commit(importId);
  }
}
