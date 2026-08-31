export interface AdmsMappingLifecycleSummary {
  deviceId: string;
  activeMappingCount: number;
  reviewRequiredCount: number;
}

export async function getAdmsMappingLifecycleSummary(
  deviceId: string,
): Promise<AdmsMappingLifecycleSummary> {
  const response = await fetch(
    `/api/admin/attendance/adms/devices/${deviceId}/mapping-lifecycle-summary`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  const body = (await response.json().catch(() => null)) as
    | { item?: AdmsMappingLifecycleSummary; message?: string }
    | null;
  if (!response.ok || !body?.item) {
    throw new Error(body?.message ?? "Ringkasan hubungan pegawai tidak dapat dimuat.");
  }
  return body.item;
}
