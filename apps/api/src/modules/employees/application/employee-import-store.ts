import type {
  EmployeeImportCommitResult,
  EmployeeImportPreview,
  PlannedEmployeeImportRow,
} from "../domain/employee-import.js";

export interface SaveEmployeeImportPreviewInput {
  sourceFilename: string;
  sourceSheet: string;
  checksumSha256: string;
  rows: PlannedEmployeeImportRow[];
}

export interface EmployeeImportStore {
  findExistingEmployeeNumbers(employeeNumbers: string[]): Promise<Set<string>>;
  savePreview(input: SaveEmployeeImportPreviewInput): Promise<EmployeeImportPreview>;
  getPreview(importId: string): Promise<EmployeeImportPreview | null>;
  commit(importId: string): Promise<EmployeeImportCommitResult>;
}
