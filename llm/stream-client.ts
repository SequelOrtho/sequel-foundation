// Browser-side reader for the streamed LLM responses produced by streamJob
// (lib/llm/stream.ts). The route streams Server-Sent Events: heartbeats while
// Claude reasons, then a single `result` (the payload the panel renders) or a
// typed `error`. This collapses that stream back into a single awaited value so
// each panel's render code stays the same — it just awaits consumeLlmStream(res)
// instead of res.json(). Heartbeats are what keep the platform edge from timing
// the request out (see stream.ts); the client simply skips them.

export class LlmStreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LlmStreamError";
    this.status = status;
  }
}

// `onStatus` receives the progress-stage labels a route's job emits (see
// streamJob) so the UI can replace a bare spinner with live stage text.
// Old servers that never emit status events simply never call it.
export async function consumeLlmStream<T>(
  res: Response,
  opts?: { onStatus?: (label: string) => void },
): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";

  // Gate / validation / empty-case responses come back as plain JSON, before any
  // streaming starts. Empty-case bodies share the result payload shape, so they
  // resolve identically; error statuses throw.
  if (!contentType.includes("text/event-stream")) {
    const data = await res.json().catch(() => ({}) as Record<string, unknown>);
    if (!res.ok) {
      const message = typeof data.error === "string" ? data.error : `Failed (${res.status})`;
      throw new LlmStreamError(message, res.status);
    }
    return data as T;
  }

  if (!res.body) {
    throw new LlmStreamError("AI service returned no response body.", 502);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;

      let evt: {
        type?: string;
        label?: string;
        result?: unknown;
        status?: number;
        error?: string;
      };
      try {
        evt = JSON.parse(dataLine.slice(5).trim());
      } catch {
        continue; // ignore malformed frames
      }

      if (evt.type === "heartbeat") continue;
      if (evt.type === "status") {
        if (typeof evt.label === "string") opts?.onStatus?.(evt.label);
        continue;
      }
      if (evt.type === "error") {
        throw new LlmStreamError(evt.error ?? "AI service error.", evt.status ?? 502);
      }
      if (evt.type === "result") {
        return evt.result as T;
      }
    }
  }

  throw new LlmStreamError("AI service closed the connection before responding.", 502);
}
