// Unit tests for the LLM output contract (llm/output.ts). Foundation models
// are probabilistic: these lock the tolerated wrappers (preamble, code fences,
// trailing prose) and the failure modes (truncation, shape mismatch) that must
// surface as one typed LlmOutputError instead of an unhandled parse crash.

import { describe, expect, it } from "vitest";
import { LlmOutputError, extractJsonPayload, parseLlmJson } from "../llm/output";

describe("extractJsonPayload", () => {
  it("returns a bare JSON object untouched", () => {
    expect(extractJsonPayload('{"a":1}')).toBe('{"a":1}');
  });

  it("strips conversational preamble and trailing remarks", () => {
    const text = 'Sure, here is your JSON object:\n{"a": 1, "b": [2, 3]}\nLet me know if you need anything else!';
    expect(JSON.parse(extractJsonPayload(text))).toEqual({ a: 1, b: [2, 3] });
  });

  it("prefers a fenced ```json block", () => {
    const text = 'Here you go:\n```json\n{"fenced": true}\n```\nAnything else?';
    expect(JSON.parse(extractJsonPayload(text))).toEqual({ fenced: true });
  });

  it("handles a bare ``` fence with no language tag", () => {
    const text = '```\n[1, 2, 3]\n```';
    expect(JSON.parse(extractJsonPayload(text))).toEqual([1, 2, 3]);
  });

  it("is not derailed by braces and escaped quotes inside string values", () => {
    const payload = '{"note":"a } brace and a \\" quote { inside"}';
    expect(extractJsonPayload(`prefix ${payload} suffix`)).toBe(payload);
  });

  it("extracts top-level arrays", () => {
    expect(JSON.parse(extractJsonPayload('The list: [{"id":1},{"id":2}] as requested'))).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });

  it("throws the typed error when no JSON value is present", () => {
    expect(() => extractJsonPayload("I could not produce the summary.")).toThrow(LlmOutputError);
  });

  it("throws the typed error on a truncated (never-closing) value", () => {
    expect(() => extractJsonPayload('{"a": 1, "b": [2,')).toThrow(LlmOutputError);
  });
});

describe("parseLlmJson", () => {
  const isPoint = (v: unknown): v is { x: number; y: number } =>
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).x === "number" &&
    typeof (v as Record<string, unknown>).y === "number";

  it("returns the typed value when the guard accepts", () => {
    const out = parseLlmJson('Here it is: {"x": 1, "y": 2}', isPoint);
    expect(out).toEqual({ x: 1, y: 2 });
  });

  it("throws LlmOutputError when the payload parses but fails the guard", () => {
    expect(() => parseLlmJson('{"x": "one", "y": 2}', isPoint)).toThrow(LlmOutputError);
  });

  it("throws LlmOutputError on syntactically invalid JSON", () => {
    // Balanced braces, invalid body — passes extraction, fails JSON.parse.
    expect(() => parseLlmJson("{x: unquoted}", isPoint)).toThrow(LlmOutputError);
  });
});
