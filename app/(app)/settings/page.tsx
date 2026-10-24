import { PageHeader } from "@/components/harpy/page-header";
import { SettingsView } from "./_components/settings-view";

export const metadata = { title: "Settings - harpy" };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <PageHeader title="Settings" />
      <SettingsView />
    </div>
  );
}
