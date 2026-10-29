import { afterEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  APPROVED_MODELS,
  MODEL_NOT_APPROVED_MESSAGE,
  MODEL_NOT_APPROVED_STATUS,
  ModelNotApprovedError,
  isApprovedModel,
  modelLockIssue,
  modelLockLogLine,
} from "../llm";
import { llmErrorEvent } from "../llm/http";
import { LlmStreamError } from "../llm/stream-client";
import { stepErrorMessage } from "../assistant";

// The family model lock (AI-CRAFT §1 "Model selection"; owner ruling
// 2026-10-29, Mike: "we need to lock all now"). Only models eligible for zero
// data retention run, from any hub, through any path. Wrong versions these
// catch: an env override that reaches an unapproved model (Fable 5), an
// unapproved fallback that is tried, a refusal that calls the model first, a
// log line that carries more than the model id, and a refusal the panel
// shows as "didn't answer just now".

const FABLE = "claude-fable-5";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function freshModels() {
  vi.resetModules();
  return import("../llm/models");
}

describe("APPROVED_MODELS", () => {
  it("is exactly the zero-data-retention models, in code", () => {
    expect(APPROVED_MODELS).toEqual(["claude-opus-5", "claude-opus-4-8"]);
    expect(isApprovedModel("claude-opus-5")).toBe(true);
    expect(isApprovedModel("claude-opus-4-8")).toBe(true);
    expect(isApprovedModel(FABLE)).toBe(false);
    expect(isApprovedModel("claude-opus-5 ")).toBe(false);
    expect(isApprovedModel("")).toBe(false);
  });
});

describe("withModelFallback: the lock", () => {
  it("an LLM_MODEL_PROSE override to Fable 5 makes no call and throws the 503 refusal", async () => {
    vi.stubEnv("LLM_MODEL_PROSE", FABLE);
    const models = await freshModels();
    expect(models.modelFor("prose")).toBe(FABLE);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const call = vi.fn();
    const run = models.withModelFallback(models.modelFor("prose"), call);
    await expect(run).rejects.toMatchObject({
      name: "ModelNotApprovedError",
      status: MODEL_NOT_APPROVED_STATUS,
      message: MODEL_NOT_APPROVED_MESSAGE,
      model: FABLE,
    });
    expect(call).not.toHaveBeenCalled();
    // One log line, naming the model id and nothing else.
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0]).toEqual([modelLockLogLine(FABLE)]);
    expect(modelLockLogLine(FABLE)).toBe(`[llm] model ${FABLE} is not on the approved list; no model call made`);
  });

  it("the same for the presentation class and a model id passed directly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("LLM_MODEL_PRESENTATION", FABLE);
    const models = await freshModels();
    const call = vi.fn();
    await expect(models.withModelFallback(models.modelFor("presentation"), call)).rejects.toMatchObject({ status: 503 });
    await expect(models.withModelFallback("claude-sonnet-4-5", call)).rejects.toMatchObject({ model: "claude-sonnet-4-5" });
    expect(call).not.toHaveBeenCalled();
  });

  it("an LLM_MODEL_FALLBACK override to Fable 5 is never tried; the primary's error stands", async () => {
    vi.stubEnv("LLM_MODEL_FALLBACK", FABLE);
    const models = await freshModels();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unavailable = Object.create(Anthropic.NotFoundError.prototype) as Error;
    const call = vi.fn().mockRejectedValue(unavailable);
    await expect(models.withModelFallback("claude-opus-5", call)).rejects.toBe(unavailable);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0]).toBe("claude-opus-5");
    expect(warn.mock.calls.flat().join(" ")).toMatch(/not on the approved list and was not tried/);
  });

  it("an approved env override runs as usual, and its approved fallback still rescues", async () => {
    vi.stubEnv("LLM_MODEL_PROSE", "claude-opus-4-8");
    vi.stubEnv("LLM_MODEL_FALLBACK", "claude-opus-5");
    const models = await freshModels();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = vi.fn().mockResolvedValue("ok");
    expect(await models.withModelFallback(models.modelFor("prose"), ok)).toEqual({ result: "ok", model: "claude-opus-4-8" });
    const rescue = vi
      .fn()
      .mockRejectedValueOnce(Object.create(Anthropic.NotFoundError.prototype) as Error)
      .mockResolvedValueOnce("rescued");
    expect(await models.withModelFallback(models.modelFor("prose"), rescue)).toEqual({ result: "rescued", model: "claude-opus-5" });
    expect(rescue.mock.calls.map((c) => c[0])).toEqual(["claude-opus-4-8", "claude-opus-5"]);
  });

  it("modelLockIssue lets a route refuse before it reads anything", async () => {
    expect(modelLockIssue()).toBeNull();
    expect(modelLockIssue("presentation")).toBeNull();
    vi.stubEnv("LLM_MODEL_PROSE", FABLE);
    const models = await freshModels();
    expect(models.modelLockIssue("prose")).toEqual({ status: 503, error: MODEL_NOT_APPROVED_MESSAGE });
    expect(models.modelLockIssue("presentation")).toBeNull();
  });
});

describe("the refusal on screen", () => {
  it("travels as a 503 event with the generic message, never the model id", () => {
    const event = llmErrorEvent(new ModelNotApprovedError(FABLE));
    expect(event).toEqual({ status: 503, error: MODEL_NOT_APPROVED_MESSAGE });
    expect(event.error).not.toContain("fable");
  });

  it("the Ask the Hub panel shows it word for word", () => {
    expect(stepErrorMessage(new LlmStreamError(MODEL_NOT_APPROVED_MESSAGE, 503))).toBe(MODEL_NOT_APPROVED_MESSAGE);
  });
});
