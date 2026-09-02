import SettingsMaintenanceSection from "../components/SettingsMaintenanceSection";
import { SettingsShell } from "../components/SettingsShell";

export default function MaintenanceSettingsPage() {
  return (
    <SettingsShell title="系统维护" description="查看与当前使用环境相关的数据维护事项。">
      <SettingsMaintenanceSection />
    </SettingsShell>
  );
}
