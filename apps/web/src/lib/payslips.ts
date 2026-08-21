export interface PayslipSummary {
  id: string;
  period: string;
  publishedAt: string;
}

export interface PayslipLine {
  label: string;
  value: string;
}

export interface PayslipDetail extends PayslipSummary {
  lines: PayslipLine[];
}

export interface PayslipImportBatch {
  id: string;
  sourceFilename: string;
  status: "previewed" | "committed" | "published";
  rowCount: number;
  validCount: number;
  errorCount: number;
  createdAt: string;
  committedAt: string | null;
  publishedAt: string | null;
}

export class PayslipApiError extends Error {}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new PayslipApiError(payload?.message ?? "Permintaan payslip gagal diproses.");
  }
  return (await response.json()) as T;
}

export function getMyPayslips() {
  return request<{ items: PayslipSummary[] }>("/api/payslips");
}

export function getMyPayslip(id: string) {
  return request<PayslipDetail>(`/api/payslips/${encodeURIComponent(id)}`);
}

export function listPayslipImports() {
  return request<{ items: PayslipImportBatch[] }>("/api/admin/payslip-imports");
}

export function previewPayslipImport(file: File) {
  return request<{ batchId: string; status: string; rowCount: number; validCount: number; errorCount: number }>(
    "/api/admin/payslip-imports/preview",
    {
      method: "POST",
      headers: { "Content-Type": "text/csv", "X-File-Name": encodeURIComponent(file.name) },
      body: file,
    },
  );
}

export function commitPayslipImport(batchId: string) {
  return request<{ batchId: string; status: string }>(`/api/admin/payslip-imports/${batchId}/commit`, { method: "POST" });
}

export function publishPayslipImport(batchId: string) {
  return request<{ batchId: string; status: string }>(`/api/admin/payslip-imports/${batchId}/publish`, { method: "POST" });
}
