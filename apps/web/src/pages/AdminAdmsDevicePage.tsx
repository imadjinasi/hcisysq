import { DeviceAdminProvider } from "@/components/attendance/device-admin/DeviceAdminContext";
import { DeviceDetailShell, type DeviceAdminSection } from "@/components/attendance/device-admin/DeviceDetailShell";
import { AdminAdmsDeviceOverviewPage } from "@/pages/AdminAdmsDeviceOverviewPage";
import { AdminAdmsDeviceSectionPlaceholderPage } from "@/pages/AdminAdmsDeviceSectionPlaceholderPage";

export function AdminAdmsDevicePage({ deviceId, section }: { deviceId: string; section: DeviceAdminSection }) {
  return (
    <DeviceAdminProvider deviceId={deviceId}>
      <DeviceDetailShell section={section}>
        {section === "overview" ? (
          <AdminAdmsDeviceOverviewPage />
        ) : (
          <AdminAdmsDeviceSectionPlaceholderPage section={section} />
        )}
      </DeviceDetailShell>
    </DeviceAdminProvider>
  );
}
