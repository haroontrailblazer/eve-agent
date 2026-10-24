import { headers } from "next/headers";
import { isEmailAllowed } from "@/lib/allowlist";
import { auth } from "@/lib/auth";
import type { SetupStatus, Viewer } from "@/lib/chat/types";
import { getSetupStatus } from "@/lib/setup";

export async function getServerViewer(setupStatus?: SetupStatus): Promise<Viewer | null> {
  const status = setupStatus ?? (await getSetupStatus());

  if (!status.appReady) {
    return null;
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    // A session cookie for an account that is no longer allowed reads as
    // signed out.
    if (!session?.user || !isEmailAllowed(session.user.email)) {
      return null;
    }

    return {
      email: session.user.email,
      id: session.user.id,
      image: session.user.image ?? null,
      name: session.user.name,
    };
  } catch {
    return null;
  }
}
