import { describe, expect, it, vi } from "vitest";
import {
  ASSISTANT_PRIVACY_PROMPT,
  DEFAULT_PRIVACY_NOTE,
  WITHHELD_DEFAULT_HOW_TO_SEE,
  withheld,
} from "../assistant";
import { runAssistantStep, type AssistantToolDefinition } from "../assistant/server";

// Owner ruling 2026-10-29, Mike: "let's make sure when results are purposely
// being redacted based on rules that that is made clear to the user so it
// isn't reported as a 'bug'". Wrong versions these catch: a marker that names
// nothing or no way to see it, a prompt block that changes per request (breaks
// the cache), one sent twice or outside the cached prefix, and copy that calls
// the gap an error.

describe("withheld()", () => {
  it("names what was left out, says it was on purpose, and how to see it", () => {
    expect(withheld(["reasons", "notes"])).toEqual({
      withheld: `Left out on purpose by this hub's privacy rules: reasons, notes. ${WITHHELD_DEFAULT_HOW_TO_SEE}`,
    });
  });

  it("takes the hub's own way to see them", () => {
    expect(withheld(["the time-off reason"], "Open the request on Approvals to read it.").withheld).toBe(
      "Left out on purpose by this hub's privacy rules: the time-off reason. Open the request on Approvals to read it.",
    );
  });

  it("trims, drops blanks and repeats; an empty list still says it was on purpose", () => {
    expect(withheld([" notes ", "", "notes", "reasons"]).withheld).toMatch(/: notes, reasons\./);
    expect(withheld([]).withheld).toBe(`Some details were left out on purpose by this hub's privacy rules. ${WITHHELD_DEFAULT_HOW_TO_SEE}`);
    expect(withheld(["notes"], "  ").withheld).toBe("Left out on purpose by this hub's privacy rules: notes.");
  });

  it("never reads as a fault", () => {
    for (const text of [withheld(["notes"]).withheld, DEFAULT_PRIVACY_NOTE]) {
      expect(text).not.toMatch(/\b(error|bug|failed|missing)\b/i);
      expect(text).toMatch(/on purpose/);
    }
  });
});

describe("ASSISTANT_PRIVACY_PROMPT", () => {
  const TOOLS: AssistantToolDefinition[] = [{ name: "t", description: "d", input_schema: { type: "object", properties: {} } }];

  function client() {
    const create = vi.fn(async (_body: Record<string, unknown>, _opts?: unknown) => ({
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      usage: {},
    }));
    return { client: { messages: { create } } as never, create };
  }

  it("tells the model to say so plainly and never call it an error or a bug", () => {
    expect(ASSISTANT_PRIVACY_PROMPT).toContain('"withheld"');
    expect(ASSISTANT_PRIVACY_PROMPT).toMatch(/on purpose/);
    expect(ASSISTANT_PRIVACY_PROMPT).toMatch(/Never call it an error, a bug/);
  });

  it("is sent once per step, at the end of the cached prefix, the same text for every hub and context", async () => {
    const bodies: Record<string, unknown>[] = [];
    for (const system of [
      { prompt: "Hub A prompt.", context: "Role: member. Today: 2026-10-29." },
      { prompt: "Hub B prompt." },
    ]) {
      const { client: c, create } = client();
      await runAssistantStep({ messages: [{ role: "user", content: "q" }], tools: TOOLS, runTool: vi.fn(), system, client: c });
      bodies.push(create.mock.calls[0][0]);
    }
    for (const body of bodies) {
      const blocks = body.system as { text: string; cache_control?: unknown }[];
      const privacy = blocks.filter((b) => b.text === ASSISTANT_PRIVACY_PROMPT);
      expect(privacy).toHaveLength(1);
      // The cache marker sits on it, so the hub prompt and this block are one cached prefix;
      // nothing before it is marked and nothing after it is cached.
      expect(blocks.findIndex((b) => b.cache_control)).toBe(blocks.indexOf(privacy[0]));
      expect(blocks.filter((b) => b.cache_control)).toHaveLength(1);
      expect(blocks.indexOf(privacy[0])).toBe(1);
    }
  });
});
