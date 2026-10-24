import { Suspense, type ReactNode } from "react";
import { AgentChatBootstrapSync } from "@/app/_components/agent-chat-bootstrap-sync";
import { AppShell } from "@/app/_components/app-shell";
import { listChatsPageByUser } from "@/lib/db/queries";
import { getServerViewer } from "@/lib/session";
import { getInitialSetupStatus, getSetupStatus } from "@/lib/setup";

export default function AppLayout({ children }: { readonly children: ReactNode }) {
  const setupStatus = getInitialSetupStatus();

  return (
    <AppShell setupStatus={setupStatus}>
      {children}
      <div className="hidden" aria-hidden>
        <Suspense fallback={null}>
          <ResolvedAppBootstrap />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function ResolvedAppBootstrap() {
  const setupStatus = await getSetupStatus();
  const viewer = await getServerViewer(setupStatus);
  const appReady = setupStatus.appReady;
  const initialChatsPage =
    viewer && appReady
      ? await listChatsPageByUser(viewer.id)
      : { items: [], nextCursor: null };

  return (
    <AgentChatBootstrapSync
      chats={initialChatsPage.items}
      nextCursor={initialChatsPage.nextCursor}
      setupStatus={setupStatus}
      slackConfigured={Boolean(process.env.SLACK_CONNECTOR)}
      viewer={viewer}
    />
  );
}
