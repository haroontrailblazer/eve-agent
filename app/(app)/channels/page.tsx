import { PageHeader } from "@/components/harpy/page-header";
import { ChannelsView } from "./_components/channels-view";

export default function ChannelsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <PageHeader title="Channels" />
      <ChannelsView />
    </div>
  );
}
