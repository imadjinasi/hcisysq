import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type {
  EmployeeImportCandidate,
  EmployeeImportCommitResult,
  EmployeeImportPreview,
  EmployeeImportSummary,
  ImportAction,
  ImportIssue,
} from "../domain/employee-import.js";
import { EMPLOYEE_SOURCE_HEADERS, normalizeReferenceName } from "../domain/employee-import.js";
import type {
  EmployeeImportStore,
  SaveEmployeeImportPreviewInput,
} from "../application/employee-import-store.js";

interface ImportJobRow {
  id: string;
  source_filename: string;
  source_sheet: string;
  checksum_sha256: string;
  row_count: number;
  insert_count: number;
  update_count: number;
  warning_count: number;
  error_count: number;
  status: "previewed" | "committed" | "failed";
  created_at: Date;
  committed_at: Date | null;
}

interface ImportDetailRow {
  row_number: number;
  action: ImportAction;
  payload: EmployeeImportCandidate | null;
  messages: ImportIssue[];
}

const canonicalSourceHeaders: Set<string> = new Set(Object.values(EMPLOYEE_SOURCE_HEADERS).map(normalizeReferenceName));
export const canonicalPreviewFields = ["employeeNumber", "fullName", "status", "employmentStatus", "unitName", "positionName", "employmentType", "functionalPosition", "structuralPosition", "email", "phone", "education", "startedOn", "endedOn"];

export function buildEmployeeImportPreviewState(candidate: EmployeeImportCandidate, before: Record<string, unknown> | null) {
  const present = new Set(["employeeNumber", ...candidate.presentFields]);
  const after = Object.fromEntries(canonicalPreviewFields.map((field) => [field, present.has(field) ? candidate[field as keyof EmployeeImportCandidate] ?? null : before?.[field] ?? null]));
  return { before, after,
    changedFields:canonicalPreviewFields.filter((field)=>String(before?.[field]??"")!==String(after[field]??"")),
    explicitClears:canonicalPreviewFields.filter((field)=>present.has(field)&&after[field]==null&&before?.[field]!=null),
    absentCanonicalFields:canonicalPreviewFields.filter((field)=>!present.has(field)) };
}

export class EmployeeImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeImportConflictError";
  }
}

function toSummary(row: ImportJobRow): EmployeeImportSummary {
  return {
    importId: row.id,
    sourceFilename: row.source_filename,
    sourceSheet: row.source_sheet,
    checksumSha256: row.checksum_sha256,
    rowCount: row.row_count,
    insertCount: row.insert_count,
    updateCount: row.update_count,
    warningCount: row.warning_count,
    errorCount: row.error_count,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    committedAt: row.committed_at?.toISOString() ?? null,
  };
}

export class PostgresEmployeeImportStore implements EmployeeImportStore {
  constructor(private readonly pool: Pool) {}

  async findExistingEmployeeNumbers(employeeNumbers: string[]): Promise<Set<string>> {
    if (employeeNumbers.length === 0) return new Set();

    const result = await this.pool.query<{ employee_number: string }>(
      "SELECT employee_number FROM employees WHERE employee_number = ANY($1::text[])",
      [employeeNumbers],
    );
    return new Set(result.rows.map((row) => row.employee_number));
  }

  async savePreview(input: SaveEmployeeImportPreviewInput): Promise<EmployeeImportPreview> {
    const client = await this.pool.connect();
    const importId = randomUUID();
    const warningCount = input.rows.filter((row) =>
      row.issues.some((issue) => issue.severity === "warning"),
    ).length;
    const errorCount = input.rows.filter((row) => row.action === "error").length;
    const insertCount = input.rows.filter((row) => row.action === "insert").length;
    const updateCount = input.rows.filter((row) => row.action === "update").length;

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO employee_import_jobs (
          id, source_filename, source_sheet, checksum_sha256, row_count,
          insert_count, update_count, warning_count, error_count, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'previewed')`,
        [
          importId,
          input.sourceFilename,
          input.sourceSheet,
          input.checksumSha256,
          input.rows.length,
          insertCount,
          updateCount,
          warningCount,
          errorCount,
        ],
      );

      for (const row of input.rows) {
        await client.query(
          `INSERT INTO employee_import_rows (
            import_job_id, row_number, employee_number, action, payload, messages
          ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
          [
            importId,
            row.rowNumber,
            row.candidate?.employeeNumber ?? null,
            row.action,
            JSON.stringify(row.candidate),
            JSON.stringify(row.issues),
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const preview = await this.getPreview(importId);
    if (!preview) throw new Error("Import preview gagal dibaca setelah disimpan.");
    return preview;
  }

  async getPreview(importId: string): Promise<EmployeeImportPreview | null> {
    const job = await this.pool.query<ImportJobRow>(
      "SELECT * FROM employee_import_jobs WHERE id = $1",
      [importId],
    );
    const jobRow = job.rows[0];
    if (!jobRow) return null;

    const rows = await this.pool.query<ImportDetailRow>(
      `SELECT row_number, action, payload, messages
       FROM employee_import_rows
       WHERE import_job_id = $1
       ORDER BY row_number`,
      [importId],
    );
    const numbers = rows.rows.flatMap((row) => row.payload?.employeeNumber ? [row.payload.employeeNumber] : []);
    const existing = numbers.length ? await this.pool.query<Record<string, unknown>>(
      `SELECT e.employee_number AS "employeeNumber", e.full_name AS "fullName", e.status, e.employment_status AS "employmentStatus", u.name AS "unitName", p.name AS "positionName", e.employment_type AS "employmentType", e.functional_position AS "functionalPosition", e.structural_position AS "structuralPosition", e.email, e.phone, e.education, e.started_on::text AS "startedOn", e.ended_on::text AS "endedOn" FROM employees e LEFT JOIN organizational_units u ON u.id=e.organizational_unit_id LEFT JOIN positions p ON p.id=e.position_id WHERE e.employee_number = ANY($1::text[])`, [numbers],
    ) : { rows: [] as Record<string, unknown>[] };
    const existingByNumber = new Map(existing.rows.map((row) => [String(row.employeeNumber), row]));

    return {
      ...toSummary(jobRow),
      canonicalColumns: Object.values(EMPLOYEE_SOURCE_HEADERS).filter((header) => rows.rows.some((row) => row.payload && Object.keys(row.payload.sourceData ?? {}).some((key) => normalizeReferenceName(key) === normalizeReferenceName(header)))),
      preservedUnmodeledColumns: [...new Set(rows.rows.flatMap((row) => Object.keys(row.payload?.sourceData ?? {}).filter((key) => !canonicalSourceHeaders.has(normalizeReferenceName(key)))))],
      rows: rows.rows.map((row) => {
        if (!row.payload) return { rowNumber:row.row_number,action:row.action,issues:row.messages,before:null,after:null,changedFields:[],explicitClears:[],absentCanonicalFields:[] };
        return { rowNumber:row.row_number,action:row.action,issues:row.messages,...buildEmployeeImportPreviewState(row.payload,existingByNumber.get(row.payload.employeeNumber)??null) };
      }),
    };
  }

  async commit(importId: string): Promise<EmployeeImportCommitResult> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const jobResult = await client.query<ImportJobRow>(
        "SELECT * FROM employee_import_jobs WHERE id = $1 FOR UPDATE",
        [importId],
      );
      const job = jobResult.rows[0];
      if (!job) throw new EmployeeImportConflictError("Import preview tidak ditemukan.");
      if (job.status !== "previewed") {
        throw new EmployeeImportConflictError("Import ini tidak lagi berada pada status previewed.");
      }
      if (job.error_count > 0) {
        throw new EmployeeImportConflictError("Import dengan error tidak dapat di-commit.");
      }

      const rows = await client.query<ImportDetailRow>(
        `SELECT row_number, action, payload, messages
         FROM employee_import_rows
         WHERE import_job_id = $1
         ORDER BY row_number
         FOR UPDATE`,
        [importId],
      );

      let insertCount = 0;
      let updateCount = 0;

      for (const row of rows.rows) {
        if (!row.payload || (row.action !== "insert" && row.action !== "update")) continue;
        const actualAction = await this.upsertEmployee(client, row.payload, importId, row.row_number);
        if (actualAction === "insert") insertCount += 1;
        if (actualAction === "update") updateCount += 1;

        await client.query(
          `UPDATE employee_import_rows
           SET action = $3
           WHERE import_job_id = $1 AND row_number = $2`,
          [importId, row.row_number, actualAction],
        );
      }

      const committed = await client.query<ImportJobRow>(
        `UPDATE employee_import_jobs
         SET status = 'committed', insert_count = $2, update_count = $3, committed_at = now()
         WHERE id = $1
         RETURNING *`,
        [importId, insertCount, updateCount],
      );

      await client.query("COMMIT");
      const summary = toSummary(committed.rows[0]!);
      return { ...summary, committedCount: insertCount + updateCount };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async upsertEmployee(
    client: PoolClient,
    candidate: EmployeeImportCandidate,
    importId: string,
    rowNumber: number,
  ): Promise<"insert" | "update"> {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM employees WHERE employee_number = $1 FOR UPDATE",
      [candidate.employeeNumber],
    );

    const unitId = candidate.unitName
      ? await this.upsertReference(client, "organizational_units", candidate.unitName)
      : null;
    const positionId = candidate.positionName
      ? await this.upsertReference(client, "positions", candidate.positionName)
      : null;

    if (existing.rows[0]) {
      await client.query(
        `UPDATE employees SET
          full_name = CASE WHEN 'fullName' = ANY($16::text[]) THEN $2 ELSE full_name END,
          status = CASE WHEN 'status' = ANY($16::text[]) THEN $3 ELSE status END,
          employment_status = CASE WHEN 'employmentStatus' = ANY($16::text[]) THEN $4 ELSE employment_status END,
          organizational_unit_id = CASE WHEN 'unitName' = ANY($16::text[]) THEN $5 ELSE organizational_unit_id END,
          position_id = CASE WHEN 'positionName' = ANY($16::text[]) THEN $6 ELSE position_id END,
          employment_type = CASE WHEN 'employmentType' = ANY($16::text[]) THEN $7 ELSE employment_type END,
          functional_position = CASE WHEN 'functionalPosition' = ANY($16::text[]) THEN $8 ELSE functional_position END,
          structural_position = CASE WHEN 'structuralPosition' = ANY($16::text[]) THEN $9 ELSE structural_position END,
          email = CASE WHEN 'email' = ANY($16::text[]) THEN $10 ELSE email END,
          phone = CASE WHEN 'phone' = ANY($16::text[]) THEN $11 ELSE phone END,
          education = CASE WHEN 'education' = ANY($16::text[]) THEN $12 ELSE education END,
          started_on = CASE WHEN 'startedOn' = ANY($16::text[]) THEN $13 ELSE started_on END,
          ended_on = CASE WHEN 'endedOn' = ANY($16::text[]) THEN $14 ELSE ended_on END,
          source_last_import_job_id = $15,
          updated_at = now()
        WHERE employee_number = $1`,
        [
          candidate.employeeNumber,
          candidate.fullName,
          candidate.status,
          candidate.employmentStatus,
          unitId,
          positionId,
          candidate.employmentType,
          candidate.functionalPosition,
          candidate.structuralPosition,
          candidate.email,
          candidate.phone,
          candidate.education,
          candidate.startedOn,
          candidate.endedOn,
          importId, candidate.presentFields,
        ],
      );
      await this.saveSourceSnapshot(client, existing.rows[0].id, importId, rowNumber, candidate);
      return "update";
    }

    await client.query(
      `INSERT INTO employees (
        id, employee_number, full_name, status, employment_status,
        organizational_unit_id, position_id, employment_type,
        functional_position, structural_position, email, phone, education,
        started_on, ended_on, source_last_import_job_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        randomUUID(),
        candidate.employeeNumber,
        candidate.fullName,
        candidate.status,
        candidate.employmentStatus,
        unitId,
        positionId,
        candidate.employmentType,
        candidate.functionalPosition,
        candidate.structuralPosition,
        candidate.email,
        candidate.phone,
        candidate.education,
        candidate.startedOn,
        candidate.endedOn,
        importId,
      ],
    );
    const inserted = await client.query<{ id: string }>("SELECT id FROM employees WHERE employee_number = $1", [candidate.employeeNumber]);
    await this.saveSourceSnapshot(client, inserted.rows[0]!.id, importId, rowNumber, candidate);
    return "insert";
  }

  private async saveSourceSnapshot(client: PoolClient, employeeId: string, importId: string, rowNumber: number, candidate: EmployeeImportCandidate) {
    const job = await client.query<{ source_filename: string; source_sheet: string }>("SELECT source_filename, source_sheet FROM employee_import_jobs WHERE id = $1", [importId]);
    const unmodeled = Object.fromEntries(Object.entries(candidate.sourceData).filter(([key]) => !canonicalSourceHeaders.has(normalizeReferenceName(key))));
    await client.query(`INSERT INTO employee_import_source_snapshots (id, employee_id, import_job_id, row_number, source_filename, source_sheet, source_data, unmodeled_source_data)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`, [randomUUID(), employeeId, importId, rowNumber, job.rows[0]!.source_filename, job.rows[0]!.source_sheet, JSON.stringify(candidate.sourceData), JSON.stringify(unmodeled)]);
  }

  private async upsertReference(
    client: PoolClient,
    table: "organizational_units" | "positions",
    name: string,
  ): Promise<string> {
    const normalized = normalizeReferenceName(name);
    const id = randomUUID();
    const result = await client.query<{ id: string }>(
      `INSERT INTO ${table} (id, normalized_name, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (normalized_name)
       DO UPDATE SET name = EXCLUDED.name, updated_at = now()
       RETURNING id`,
      [id, normalized, name.trim()],
    );
    return result.rows[0]!.id;
  }
}
