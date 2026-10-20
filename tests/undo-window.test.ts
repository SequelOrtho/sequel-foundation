import { describe, expect, it } from "vitest";
import {
  UNDO_WINDOW_MINUTES,
  undoExpiresAt,
  undoRefusal,
  undoRefusalMessage,
  undoTicket,
  undoTicketExpired,
  undoTicketFrom,
} from "../undo";

const AT = new Date("2026-10-20T19:00:00Z");
const rec = { deletedAt: AT, deletedBy: "Pat@Sequelortho.com", restoredAt: null };

describe("undo window", () => {
  it("is 30 minutes (owner ruling 2026-10-20)", () => {
    expect(UNDO_WINDOW_MINUTES).toBe(30);
    expect(undoExpiresAt(AT).toISOString()).toBe("2026-10-20T19:30:00.000Z");
    expect(undoTicket("t1", "Task “Call vendor”", AT)).toEqual({
      id: "t1",
      label: "Task “Call vendor”",
      expiresAt: "2026-10-20T19:30:00.000Z",
    });
  });

  it("lets only the deleter undo, once, inside the window", () => {
    const in29 = new Date(AT.getTime() + 29 * 60_000);
    expect(undoRefusal(rec, " pat@sequelortho.com ", in29)).toBeNull();
    expect(undoRefusal(rec, "lee@sequelortho.com", in29)).toBe("not-yours");
    expect(undoRefusal(rec, null, in29)).toBe("not-yours");
    expect(undoRefusal({ ...rec, deletedBy: "" }, " ", in29)).toBe("not-yours");
    expect(undoRefusal(null, "pat@sequelortho.com", in29)).toBe("missing");
    expect(undoRefusal({ ...rec, restoredAt: in29 }, "pat@sequelortho.com", in29)).toBe("already-restored");
    expect(undoRefusal(rec, "pat@sequelortho.com", new Date(AT.getTime() + 30 * 60_000))).toBeNull();
    expect(undoRefusal(rec, "pat@sequelortho.com", new Date(AT.getTime() + 30 * 60_000 + 1))).toBe("expired");
  });

  it("words every refusal but expiry alike", () => {
    expect(undoRefusalMessage("missing")).toBe(undoRefusalMessage("not-yours"));
    expect(undoRefusalMessage("already-restored")).toBe(undoRefusalMessage("missing"));
    expect(undoRefusalMessage("expired")).toMatch(/30-minute/);
  });

  it("reads a ticket from a delete route's body", () => {
    const t = undoTicket("t1", "Rule", AT);
    expect(undoTicketFrom({ undo: t })).toEqual(t);
    expect(undoTicketFrom({ ok: true })).toBeNull();
    expect(undoTicketFrom({ undo: { ...t, expiresAt: "soon" } })).toBeNull();
    expect(undoTicketFrom(null)).toBeNull();
    expect(undoTicketExpired(t, new Date("2026-10-20T19:29:59Z"))).toBe(false);
    // The same boundary as the server: still open at the expiry instant.
    expect(undoTicketExpired(t, new Date("2026-10-20T19:30:00Z"))).toBe(false);
    expect(undoTicketExpired(t, new Date("2026-10-20T19:30:00.001Z"))).toBe(true);
  });
});
