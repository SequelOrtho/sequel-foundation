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

  it.each([
    ["NotFoundError", Anthropic.NotFoundError],
    ["PermissionDeniedError", Anthropic.PermissionDeniedError],
    ["BadRequestError", Anthropic.BadRequestError],
  ])("retries on the fallback model when the primary is unavailable (%s)", async (_name, cls) => {
    const call = vi.fn().mockRejectedValueOnce(fakeError(cls)).mockResolvedValueOnce("rescued");
    const out = await withModelFallback("claude-opus-5", call);
    expect(out).toEqual({ result: "rescued", model: LLM_FALLBACK_MODEL });
    expect(call).toHaveBeenLastCalledWith(LLM_FALLBACK_MODEL);
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
