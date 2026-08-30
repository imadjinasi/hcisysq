import { DeviceAdminProvider } from "@/components/attendance/device-admin/DeviceAdminContext";
import { DeviceDetailShell, type DeviceAdminSection } from "@/components/attendance/device-admin/DeviceDetailShell";
import { AdminAdmsDeviceCommandsPage } from "@/pages/AdminAdmsDeviceCommandsPage";
import { AdminAdmsDeviceOverviewPage } from "@/pages/AdminAdmsDeviceOverviewPage";
import { AdminAdmsDeviceSectionPlaceholderPage } from "@/pages/AdminAdmsDeviceSectionPlaceholderPage";
import { AdminAdmsDeviceTransactionsPage } from "@/pages/AdminAdmsDeviceTransactionsPage";
import { AdminAdmsDeviceUsersPage } from "@/pages/AdminAdmsDeviceUsersPage";

function sectionContent(section: DeviceAdminSection) {
  if (section === "overview") return <AdminAdmsDeviceOverviewPage />;
  if (section === "users") return <AdminAdmsDeviceUsersPage />;
  if (section === "transactions") return <AdminAdmsDeviceTransactionsPage />;
  if (section === "commands") return <AdminAdmsDeviceCommandsPage />;
  return <AdminAdmsDeviceSectionPlaceholderPage section={section} />;
}

export function AdminAdmsDevicePage({ deviceId, section }: { deviceId: string; section: DeviceAdminSection }) {
  return (
    <DeviceAdminProvider deviceId={deviceId}>
      <DeviceDetailShell section={section}>
        {sectionContent(section)}
      </DeviceDetailShell>
    </DeviceAdminProvider>
  );
}
