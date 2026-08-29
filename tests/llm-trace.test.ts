// Unit tests for the per-request trace helper (llm/trace.ts) — the Gate 5
// observability floor. Locks the record shape, the sanitized preview, the
// class-not-message error naming, and the never-breaks-the-feature delivery.

import { describe, expect, it, vi } from "vitest";
import {
  consoleTraceSink,
  emitLlmTrace,
  sanitizedPreview,
  startLlmTrace,
} from "../llm/trace";

describe("sanitizedPreview", () => {
  it("redacts secrets before anything reaches a sink", () => {
    expect(sanitizedPreview("key sk-abcdefghijklmnopqrst here")).toBe(
      "key [redacted api-key] here",
    );
  });

  it("truncates long input with an ellipsis", () => {
    const out = sanitizedPreview("x".repeat(400));
    expect(out.length).toBe(301);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("startLlmTrace", () => {
  it("builds a success record with model, usage, and non-negative latency", () => {
    const trace = startLlmTrace({ feature: "categorize", input: "a fall near bay 3", requestId: "req-1" });
    const record = trace.succeed({
      model: "claude-opus-5",
      viaFallback: false,
      usage: { input_tokens: 812, output_tokens: 96 },
    });
    expect(record).toMatchObject({
      feature: "categorize",
      requestId: "req-1",
      model: "claude-opus-5",
      viaFallback: false,
      inputChars: 17,
      inputPreview: "a fall near bay 3",
      inputTokens: 812,
      outputTokens: 96,
      outcome: "ok",
      errorClass: null,
    });
    expect(record.latencyMs).toBeGreaterThanOrEqual(0);
    expect(new Date(record.at).getTime()).not.toBeNaN();
  });

  it("generates a requestId when none is supplied", () => {
    const trace = startLlmTrace({ feature: "assist" });
    expect(trace.requestId).toMatch(/[0-9a-f-]{36}/);
    expect(trace.succeed({ model: "m" }).requestId).toBe(trace.requestId);
  });

  it("omits input fields when no input was given (metadata-only callers)", () => {
    const record = startLlmTrace({ feature: "assist" }).succeed({ model: "m" });
    expect(record.inputChars).toBeNull();
    expect(record.inputPreview).toBeNull();
  });

  it("names the error class (with status when present), never the message", () => {
    class FakeApiError extends Error {
      status = 429;
    }
    const record = startLlmTrace({ feature: "assist" }).fail(
      new FakeApiError("secret-bearing message"),
    );
    expect(record.outcome).toBe("error");
    expect(record.errorClass).toBe("FakeApiError 429");
    expect(JSON.stringify(record)).not.toContain("secret-bearing");
  });
});

describe("emitLlmTrace", () => {
  const record = startLlmTrace({ feature: "assist" }).succeed({ model: "m" });

  it("survives a synchronously throwing sink", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      emitLlmTrace(() => {
        throw new Error("sink down");
      }, record),
    ).not.toThrow();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("survives an async-rejecting sink", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    emitLlmTrace(() => Promise.reject(new Error("sink down")), record);
    await new Promise((r) => setTimeout(r, 0));
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("delivers the record to a healthy sink", () => {
    const sink = vi.fn();
    emitLlmTrace(sink, record);
    expect(sink).toHaveBeenCalledWith(record);
  });
});

describe("consoleTraceSink", () => {
  it("stays quiet under NODE_ENV=test, logs one structured line otherwise", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const record = startLlmTrace({ feature: "assist" }).succeed({ model: "m" });

    consoleTraceSink(record);
    expect(info).not.toHaveBeenCalled();

    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      consoleTraceSink(record);
      expect(info).toHaveBeenCalledTimes(1);
      const line = info.mock.calls[0][0] as string;
      expect(line.startsWith("[llm-trace] ")).toBe(true);
      expect(JSON.parse(line.slice("[llm-trace] ".length)).feature).toBe("assist");
    } finally {
      process.env.NODE_ENV = original;
      info.mockRestore();
    }
  });
});
