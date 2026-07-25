import { llmErrorEvent } from "./http";

// Shared SSE wrapper for the LLM-backed routes. The Anthropic calls (Opus 5 +
// adaptive thinking) routinely run ~20s — well past the ~10s synchronous
// function timeout on Netlify, whose edge then returns a 502 before the model
// responds. The fix, platform-wide: never block a buffered HTTP response on the
// call. `streamJob` returns a streamed response that emits a heartbeat at t=0
// and on an interval while the job runs, so time-to-first-byte is ~0 and bytes
// keep flowing — the connection stays open until the result (or a typed error)
// is ready. The browser reads to the terminal event via consumeLlmStream and
// renders the same payload it used to get from the JSON body.

// Heartbeat cadence — comfortably under the platform's idle/first-byte timeout.
const HEARTBEAT_MS = 3000;

const encoder = new TextEncoder();
function sse(event: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

// SSE event shapes the client (consumeLlmStream) understands:
//   { type: "heartbeat" }                          — keep-alive, ignored
//   { type: "result", result: <payload> }          — the resolved job value
//   { type: "error", status: number, error: string } — typed failure
export type LlmStreamEvent =
  | { type: "heartbeat" }
  | { type: "result"; result: unknown }
  | { type: "error"; status: number; error: string };

// Wrap an async job (the deterministic-data load is done by the caller; `job`
// is just the LLM call + payload assembly) in a streamed SSE response.
export function streamJob<T>(job: () => Promise<T>): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const enqueue = (bytes: Uint8Array) => {
        if (!open) return;
        try {
          controller.enqueue(bytes);
        } catch {
          // Client went away mid-stream; stop trying to write.
          open = false;
        }
      };

      // First byte immediately so the platform never sees an idle connection.
      enqueue(sse({ type: "heartbeat" } satisfies LlmStreamEvent));
      const timer = setInterval(
        () => enqueue(sse({ type: "heartbeat" } satisfies LlmStreamEvent)),
        HEARTBEAT_MS,
      );

      try {
        const result = await job();
        enqueue(sse({ type: "result", result } satisfies LlmStreamEvent));
      } catch (err) {
        enqueue(sse({ type: "error", ...llmErrorEvent(err) } satisfies LlmStreamEvent));
      } finally {
        clearInterval(timer);
        open = false;
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy/CDN response buffering so heartbeats reach the client live.
      "X-Accel-Buffering": "no",
    },
  });
}
