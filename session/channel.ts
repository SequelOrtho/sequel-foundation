import { SESSION_CHANNEL } from "./policy";

// Cross-tab "this hub signed out" signal (BroadcastChannel; silently absent
// where unsupported). The tab that signs out marks itself so its own
// SessionWatch does not flash the signed-out dialog while the page navigates.

export type SessionMessage = { type: "signed-out" };

let signingOutHere = false;

export function isSigningOutHere(): boolean {
  return signingOutHere;
}

export function announceSignOut(): void {
  signingOutHere = true;
  try {
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage({ type: "signed-out" } satisfies SessionMessage);
    channel.close();
  } catch {
    // No BroadcastChannel (old browser, test env): other tabs find out on focus.
  }
}

export function onSessionMessage(handler: (msg: SessionMessage) => void): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(SESSION_CHANNEL);
  } catch {
    return () => {};
  }
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as Partial<SessionMessage> | null;
    if (data && data.type === "signed-out") handler({ type: "signed-out" });
  };
  return () => channel?.close();
}
