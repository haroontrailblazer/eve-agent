import { Client } from "eve/client";

// Browser only. Starts a harpy session with a Studio request and returns as
// soon as the server accepts it. It never awaits result(): the Studio polls
// the snapshot to see the drafts land.
export async function startHarpyRun(message: string): Promise<{ readonly sessionId: string }> {
  const client = new Client({ host: window.location.origin, redirect: "error" });
  const { response } = await client.sessions.create({ message });
  return { sessionId: response.sessionId };
}
