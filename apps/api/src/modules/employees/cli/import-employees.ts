import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { loadConfig } from "../../../config/env.js";
import { createPool } from "../../../db/pool.js";
import { EmployeeImportService } from "../application/employee-import-service.js";
import { PostgresEmployeeImportStore } from "../infrastructure/postgres-employee-import-store.js";

interface CliArgs {
  file: string | null;
  commitId: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let file: string | null = null;
  let commitId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") file = argv[index + 1] ?? null;
    if (arg === "--commit") commitId = argv[index + 1] ?? null;
  }

  if ((file && commitId) || (!file && !commitId)) {
    throw new Error(
      "Gunakan salah satu: --file <workbook.xlsx> untuk preview, atau --commit <import-id> untuk commit.",
    );
  }

  return { file, commitId };
}

const config = loadConfig();
if (config.NODE_ENV === "production") {
  throw new Error("CLI bootstrap employee import tidak boleh dijalankan dengan NODE_ENV=production.");
}

const args = parseArgs(process.argv.slice(2));
const pool = createPool(config.DATABASE_URL);
const service = new EmployeeImportService(new PostgresEmployeeImportStore(pool));

try {
  if (args.file) {
    const filePath = resolve(args.file);
    if (!filePath.toLowerCase().endsWith(".xlsx")) {
      throw new Error("Employee import hanya menerima file .xlsx.");
    }

    const preview = await service.preview({
      filename: basename(filePath),
      buffer: await readFile(filePath),
    });

    console.log(
      JSON.stringify(
        {
          importId: preview.importId,
          status: preview.status,
          rowCount: preview.rowCount,
          insertCount: preview.insertCount,
          updateCount: preview.updateCount,
          warningCount: preview.warningCount,
          errorCount: preview.errorCount,
          issues: preview.rows
            .filter((row) => row.issues.length > 0)
            .map((row) => ({ rowNumber: row.rowNumber, codes: row.issues.map((issue) => issue.code) })),
        },
        null,
        2,
      ),
    );
  } else if (args.commitId) {
    const result = await service.commit(args.commitId);
    console.log(
      JSON.stringify(
        {
          importId: result.importId,
          status: result.status,
          committedCount: result.committedCount,
          insertCount: result.insertCount,
          updateCount: result.updateCount,
          warningCount: result.warningCount,
          errorCount: result.errorCount,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await pool.end();
}
