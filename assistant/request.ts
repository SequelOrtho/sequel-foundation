import { gateLlmInput, type LlmRedactionKind } from "../llm/input-gate";
import { MAX_BODY_CHARS, parseConversation, type Message } from "./conversation";

// The part of a hub's POST /api/assistant/step that has nothing to do with the
// hub: read the body (capped before parsing), check the conversation the
// browser posted, and pass every question the person typed through the
// foundation input gate (secrets and SSNs redacted) before it can reach the
// model. The hub's route checks the off switch and the session first, and the
// rate budget after, in that order (404 → 401 → 413 → 422 → 429).

export type StepRequest =
  | { ok: true; messages: Message[]; redactions: LlmRedactionKind[] }
  | { ok: false; status: 413 | 422; error: string };

const TOO_LONG = "This conversation is too long. Start a new one.";

export async function readStepRequest(req: Request): Promise<StepRequest> {
  // A declared length over the cap is refused before the body is buffered
  // (bytes, so at least as strict as the character cap); the read body is
  // checked again, since the header may be absent or wrong.
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) return { ok: false, status: 413, error: TOO_LONG };
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return { ok: false, status: 413, error: TOO_LONG };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, status: 422, error: "The conversation could not be read." };
  }
  const parsed = parseConversation((body as { messages?: unknown } | null)?.messages);
  if (!parsed.ok) return { ok: false, status: 422, error: parsed.error };

  const redactions = new Set<LlmRedactionKind>();
  const messages: Message[] = [];
  for (const m of parsed.messages) {
    if (m.role === "user" && typeof m.content === "string") {
      const gated = gateLlmInput(m.content);
      if (!gated.ok) return { ok: false, status: 422, error: gated.message };
      gated.redactions.forEach((r) => redactions.add(r));
      messages.push({ role: "user", content: gated.text });
    } else {
      messages.push(m);
    }
  }
  return { ok: true, messages, redactions: [...redactions] };
}
