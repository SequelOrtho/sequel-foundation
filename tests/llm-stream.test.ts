// Tests for the SSE job wrapper (llm/stream.ts) and its browser-side reader
// (llm/stream-client.ts), including the status-stage channel: a job narrates
// its progress via the `progress` callback, the client surfaces each label
// through onStatus, and the pair still collapses to one awaited result.

import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { streamJob } from "../llm/stream";
import { LlmStreamError, consumeLlmStream } from "../llm/stream-client";
import { LlmOutputError } from "../llm/output";

function fakeError(cls: { prototype: object }): Error {
  return Object.create(cls.prototype) as Error;
}

async function readEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data:"))
    .map((chunk) => JSON.parse(chunk.slice(5).trim()));
}

describe("streamJob", () => {
  it("emits an immediate heartbeat, then the result", async () => {
    const events = await readEvents(streamJob(async () => ({ answer: 42 })));
    expect(events[0]).toEqual({ type: "heartbeat" });
    expect(events.at(-1)).toEqual({ type: "result", result: { answer: 42 } });
  });

  it("emits status events for each progress() call, in order, before the result", async () => {
    const res = streamJob(async (progress) => {
      progress("Querying policy documentation…");
      progress("Formatting summary…");
      return "done";
    });
    const events = await readEvents(res);
    const statuses = events.filter((e) => e.type === "status").map((e) => e.label);
    expect(statuses).toEqual(["Querying policy documentation…", "Formatting summary…"]);
    expect(events.at(-1)).toEqual({ type: "result", result: "done" });
  });

  it("maps a thrown typed error to a terminal error event", async () => {
    const res = streamJob(async () => {
      throw fakeError(Anthropic.RateLimitError);
    });
    const events = await readEvents(res);
    expect(events.at(-1)).toMatchObject({ type: "error", status: 429 });
  });

  it("maps an output-contract failure to the deterministic fallback event", async () => {
    const res = streamJob(async () => {
      throw new LlmOutputError("shape mismatch");
    });
    const events = await readEvents(res);
    expect(events.at(-1)).toMatchObject({
      type: "error",
      status: 502,
      error: "The AI response did not match the expected format. Try again.",
    });
  });

  it("maps the hard timeout budget to a 504 naming the budget", async () => {
    const res = streamJob(async () => {
      throw fakeError(Anthropic.APIConnectionTimeoutError);
    });
    const events = await readEvents(res);
    expect(events.at(-1)).toMatchObject({ type: "error", status: 504 });
    expect((events.at(-1) as { error: string }).error).toContain("time budget");
  });
});

describe("consumeLlmStream", () => {
  it("resolves the result and forwards status labels to onStatus", async () => {
    const res = streamJob(async (progress) => {
      progress("Analyzing…");
      return { ok: true };
    });
    const seen: string[] = [];
    const out = await consumeLlmStream<{ ok: boolean }>(res, {
      onStatus: (label) => seen.push(label),
    });
    expect(out).toEqual({ ok: true });
    expect(seen).toEqual(["Analyzing…"]);
  });

  it("ignores status events when no onStatus is supplied (old callers)", async () => {
    const res = streamJob(async (progress) => {
      progress("Analyzing…");
      return "fine";
    });
    await expect(consumeLlmStream<string>(res)).resolves.toBe("fine");
  });

  it("throws LlmStreamError with the typed status on an error event", async () => {
    const res = streamJob(async () => {
      throw fakeError(Anthropic.RateLimitError);
    });
    const err = await consumeLlmStream(res).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmStreamError);
    expect((err as LlmStreamError).status).toBe(429);
  });
});
