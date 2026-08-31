export function mappedEmployeeNeedsReview(input: {
  mappingId: string | null;
  employeeId: string | null;
  employeeStatus: string | null;
}) {
  return Boolean(
    input.mappingId
      && input.employeeId
      && input.employeeStatus !== null
      && input.employeeStatus !== "active",
  );
}

export function employeeLifecycleLabel(status: string | null) {
  if (status === "inactive") return "Pegawai nonaktif";
  if (status === "resigned") return "Pegawai resign";
  if (status === "active") return "Pegawai aktif";
  return "Status pegawai belum diketahui";
}
