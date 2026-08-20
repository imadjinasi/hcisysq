import { useParams } from "@tanstack/react-router";

import { AdminEmployeeDetailPage } from "@/pages/AdminEmployeeDetailPage";

export function AdminEmployeeDetailRoutePage() {
  const { employeeId } = useParams({ from: "/admin/employees/$employeeId" });
  return <AdminEmployeeDetailPage employeeId={employeeId} />;
}
