// Unit tests for the model-selection configuration (llm/models.ts): task-class
// → model mapping and the unavailable-model fallback. Error instances are faked
// via Object.create(prototype) so no SDK constructor plumbing is needed for
// instanceof checks. Ported from the hubs' suites — these lock the defaults on
// purpose (model adoption is a deliberate config change, not drift).

import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  LLM_FALLBACK_MODEL,
  LLM_MODEL_PRESENTATION,
  LLM_MODEL_PROSE,
  modelFor,
  withModelFallback,
} from "../llm/models";

function fakeError(cls: { prototype: object }): Error {
  return Object.create(cls.prototype) as Error;
}

describe("modelFor", () => {
  it("maps task classes to the configured defaults", () => {
    expect(modelFor("prose")).toBe(LLM_MODEL_PROSE);
    expect(modelFor("presentation")).toBe(LLM_MODEL_PRESENTATION);
  });

  it("defaults: Opus 5 for both task classes, Opus 4.8 fallback", () => {
    expect(LLM_MODEL_PROSE).toBe("claude-opus-5");
    expect(LLM_MODEL_PRESENTATION).toBe("claude-opus-5");
    expect(LLM_FALLBACK_MODEL).toBe("claude-opus-4-8");
  });
});

describe("withModelFallback", () => {
  it("returns the primary model's result without a second call on success", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    const out = await withModelFallback("claude-opus-5", call);
    expect(out).toEqual({ result: "ok", model: "claude-opus-5" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("warns when a fallback fires, naming both models and the error class", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const call = vi
      .fn()
      .mockRejectedValueOnce(fakeError(Anthropic.NotFoundError))
      .mockResolvedValueOnce("rescued");

    await withModelFallback("claude-opus-5", call);

    // A silent downgrade is the failure this guards against — the warning is
    // the only signal a caller that discards the returned model would ever see.
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain("claude-opus-5");
    expect(message).toContain(LLM_FALLBACK_MODEL);
    expect(message).toContain("NotFoundError");
    warn.mockRestore();
  });

  it("stays quiet on the happy path", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await withModelFallback("claude-opus-5", vi.fn().mockResolvedValue("ok"));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  // The served-model line is suppressed under NODE_ENV=test to keep suites
  // readable, which would otherwise leave the log that matters most in
  // production completely untested. Assert it by lifting the suppression.
  it("logs the served model outside the test environment", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await withModelFallback("claude-opus-5", vi.fn().mockResolvedValue("ok"));
      expect(info).toHaveBeenCalledWith("[llm] served by claude-opus-5");
    } finally {
      process.env.NODE_ENV = original;
      info.mockRestore();
    }
  });

  it("marks the served-model line when a fallback produced the result", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const call = vi
        .fn()
        .mockRejectedValueOnce(fakeError(Anthropic.NotFoundError))
        .mockResolvedValueOnce("rescued");
      await withModelFallback("claude-opus-5", call);
      expect(info).toHaveBeenCalledWith(
        `[llm] served by ${LLM_FALLBACK_MODEL} (via fallback)`,
      );
    } finally {
      process.env.NODE_ENV = original;
      info.mockRestore();
      warn.mockRestore();
    }
  });

  it.each([
    ["NotFoundError", Anthropic.NotFoundError],
    ["PermissionDeniedError", Anthropic.PermissionDeniedError],
    ["BadRequestError", Anthropic.BadRequestError],
  ])("retries on the fallback model when the primary is unavailable (%s)", async (_name, cls) => {
    // Spied purely to keep the fallback warning out of the suite's output.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const call = vi.fn().mockRejectedValueOnce(fakeError(cls)).mockResolvedValueOnce("rescued");
    const out = await withModelFallback("claude-opus-5", call);
    expect(out).toEqual({ result: "rescued", model: LLM_FALLBACK_MODEL });
    expect(call).toHaveBeenLastCalledWith(LLM_FALLBACK_MODEL);
    warn.mockRestore();
  });

  it("does not retry on non-availability errors (e.g. rate limits)", async () => {
    const err = fakeError(Anthropic.RateLimitError);
    const call = vi.fn().mockRejectedValue(err);
    await expect(withModelFallback("claude-opus-5", call)).rejects.toBe(err);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("does not loop when the fallback model itself is unavailable", async () => {
    const err = fakeError(Anthropic.NotFoundError);
    const call = vi.fn().mockRejectedValue(err);
    await expect(withModelFallback(LLM_FALLBACK_MODEL, call)).rejects.toBe(err);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
