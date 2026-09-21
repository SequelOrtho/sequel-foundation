import { afterEach, describe, expect, it } from "vitest";
import {
  clearAllToasts,
  dismissToast,
  getToasts,
  pushToast,
  toastError,
  toastSaved,
  toastUndo,
  UNDO_TOAST_TTL,
} from "../ui/toast/store";

afterEach(() => {
  clearAllToasts();
});

describe("toast store", () => {
  it("returns unique incrementing ids", () => {
    const a = pushToast("one");
    const b = pushToast("two");
    expect(b).toBeGreaterThan(a);
    expect(getToasts().map((t) => t.id)).toEqual([a, b]);
  });

  it("defaults ttl to 3500 without an action and 6000 with one", () => {
    const idPlain = pushToast("plain");
    const idLinked = pushToast("linked", {
      action: { label: "View project", href: "/projects/1" },
    });
    const plain = getToasts().find((t) => t.id === idPlain);
    const linked = getToasts().find((t) => t.id === idLinked);
    expect(plain?.ttl).toBe(3500);
    expect(plain?.action).toBeUndefined();
    expect(linked?.ttl).toBe(6000);
    expect(linked?.action).toEqual({ label: "View project", href: "/projects/1" });
  });

  it("honors an explicit ttl over the action default", () => {
    const id = pushToast("custom", {
      ttl: 1234,
      action: { label: "Open", href: "/x" },
    });
    expect(getToasts().find((t) => t.id === id)?.ttl).toBe(1234);
  });

  it("toastSaved carries a success tone and optional action", () => {
    const id = toastSaved("PM assigned", {
      action: { label: "View project", href: "/projects/925" },
    });
    const t = getToasts().find((x) => x.id === id);
    expect(t?.tone).toBe("success");
    expect(t?.message).toBe("PM assigned");
    expect(t?.action?.href).toBe("/projects/925");
  });

  it("toastError lingers longer than confirmations", () => {
    const idErr = toastError("Save failed — retry");
    const idOk = toastSaved();
    const err = getToasts().find((t) => t.id === idErr);
    const ok = getToasts().find((t) => t.id === idOk);
    expect(err?.tone).toBe("danger");
    expect(err!.ttl).toBeGreaterThan(ok!.ttl);
  });

  it("dismissToast removes exactly the given id", () => {
    const a = pushToast("a");
    const b = pushToast("b");
    dismissToast(a);
    expect(getToasts().some((t) => t.id === a)).toBe(false);
    expect(getToasts().some((t) => t.id === b)).toBe(true);
  });

  it("clearAllToasts empties the stack", () => {
    pushToast("a");
    pushToast("b");
    clearAllToasts();
    expect(getToasts()).toHaveLength(0);
  });

  it("toastUndo carries an Undo callback action that lingers longer than a link toast", async () => {
    let undone = 0;
    const id = toastUndo("3 alerts removed from your list", () => {
      undone += 1;
    });
    const t = getToasts().find((x) => x.id === id);
    expect(t?.tone).toBe("success");
    expect(t?.ttl).toBe(UNDO_TOAST_TTL);
    expect(t!.ttl).toBeGreaterThan(6000);
    expect(t?.action?.label).toBe("Undo");
    expect(t?.action?.href).toBeUndefined();
    await t?.action?.onClick?.();
    expect(undone).toBe(1);
    const custom = toastUndo("Archived", async () => {}, { label: "Restore", tone: "info", ttl: 4000 });
    const c = getToasts().find((x) => x.id === custom);
    expect(c?.action?.label).toBe("Restore");
    expect(c?.tone).toBe("info");
    expect(c?.ttl).toBe(4000);
  });
});
