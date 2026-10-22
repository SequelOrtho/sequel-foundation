// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REMEMBERED_VIEW_PREFIX,
  clearRememberedViews,
  parseRemembered,
  readLike,
  readRememberedRaw,
  writeRememberedRaw,
} from "../ui/remembered-view";
import { useRememberedState } from "../ui/useRememberedState";
import { SessionWatch, SignOutForm } from "../session";

class FakeChannel {
  static all = new Map<string, Set<FakeChannel>>();
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(public name: string) {
    if (!FakeChannel.all.has(name)) FakeChannel.all.set(name, new Set());
    FakeChannel.all.get(name)!.add(this);
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.all.get(this.name) ?? []) if (c !== this) c.onmessage?.({ data } as MessageEvent);
  }
  close() {
    FakeChannel.all.get(this.name)?.delete(this);
  }
}

beforeEach(() => {
  window.sessionStorage.clear();
  clearRememberedViews();
  FakeChannel.all.clear();
  vi.stubGlobal("BroadcastChannel", FakeChannel);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("readLike", () => {
  it("keeps a value with the initial value's shape", () => {
    expect(readLike("", "abc")).toBe("abc");
    expect(readLike(false, true)).toBe(true);
    expect(readLike<string[]>([], ["a", "b"])).toEqual(["a", "b"]);
    expect(readLike({ key: "name", dir: 1 }, { key: "date", dir: -1 })).toEqual({ key: "date", dir: -1 });
  });
  it("falls back to the initial value on the wrong shape", () => {
    expect(readLike("", 3)).toBe("");
    expect(readLike<string[]>([], "a")).toEqual([]);
    expect(readLike<string[]>([], [{}])).toEqual([]);
    expect(readLike(["x"], [1])).toEqual(["x"]);
    expect(readLike({ a: "", b: false }, { a: 1, b: true, c: "dropped" })).toEqual({ a: "", b: true });
  });
  it("parseRemembered survives bad JSON and nothing stored", () => {
    expect(parseRemembered(null, "x")).toBe("x");
    expect(parseRemembered("{oops", "x")).toBe("x");
    expect(parseRemembered('"y"', "x")).toBe("y");
  });
});

describe("storage", () => {
  it("stores under the shared prefix and clears only those keys", () => {
    window.sessionStorage.setItem("other.key", "keep");
    writeRememberedRaw("plan.entity", '["SEQ"]');
    expect(window.sessionStorage.getItem(`${REMEMBERED_VIEW_PREFIX}plan.entity`)).toBe('["SEQ"]');
    clearRememberedViews();
    expect(readRememberedRaw("plan.entity")).toBeNull();
    expect(window.sessionStorage.getItem("other.key")).toBe("keep");
  });

  it("falls back to memory when storage is blocked", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    writeRememberedRaw("x", '"1"');
    expect(readRememberedRaw("x")).toBe('"1"');
    spy.mockRestore();
    clearRememberedViews();
    expect(readRememberedRaw("x")).toBeNull();
  });
});

function List() {
  const [entity, setEntity, resetEntity] = useRememberedState<string[]>("list.entity", []);
  const [q, setQ] = useRememberedState("list.q", "");
  return (
    <div>
      <input aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <button type="button" onClick={() => setEntity((prev) => [...prev, "SEQ"])}>
        Add SEQ
      </button>
      <button type="button" onClick={resetEntity}>
        Clear Filters
      </button>
      <output>{entity.join(",") || "none"}</output>
    </div>
  );
}

describe("useRememberedState", () => {
  it("brings the view back when the list renders again (a back link)", () => {
    const first = render(<List />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "knee" } });
    fireEvent.click(screen.getByText("Add SEQ"));
    expect(screen.getByText("SEQ")).toBeTruthy();
    first.unmount();

    render(<List />);
    expect((screen.getByLabelText("Search") as HTMLInputElement).value).toBe("knee");
    expect(screen.getByText("SEQ")).toBeTruthy();
  });

  it("reset and setting the initial value forget the stored value", () => {
    render(<List />);
    fireEvent.click(screen.getByText("Add SEQ"));
    fireEvent.click(screen.getByText("Clear Filters"));
    expect(screen.getByText("none")).toBeTruthy();
    expect(readRememberedRaw("list.entity")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "" } });
    expect(readRememberedRaw("list.q")).toBeNull();
  });

  it("returns the same value object between renders until it changes", () => {
    const seen: unknown[] = [];
    function Probe({ n }: { n: number }) {
      const [v] = useRememberedState<string[]>("probe", []);
      seen.push(v);
      return <span>{n}</span>;
    }
    writeRememberedRaw("probe", '["a"]');
    const r = render(<Probe n={1} />);
    r.rerender(<Probe n={2} />);
    expect(seen.at(-1)).toBe(seen.at(-2));
  });

  it("is forgotten when the session ends in another tab", async () => {
    render(
      <>
        <List />
        <SessionWatch sessionUrl={null} />
      </>,
    );
    fireEvent.click(screen.getByText("Add SEQ"));
    const otherTab = new FakeChannel("sequel-session");
    act(() => otherTab.postMessage({ type: "signed-out" }));
    await screen.findByRole("alertdialog");
    expect(readRememberedRaw("list.entity")).toBeNull();
  });

  // Last: SignOutForm marks the page as signing out for good.
  it("is forgotten when this tab signs out", () => {
    render(
      <>
        <List />
        <SignOutForm />
      </>,
    );
    fireEvent.click(screen.getByText("Add SEQ"));
    const form = screen.getByRole("button", { name: "Sign Out" }).closest("form")!;
    form.addEventListener("submit", (e) => e.preventDefault());
    fireEvent.submit(form);
    expect(readRememberedRaw("list.entity")).toBeNull();
    expect(screen.getByText("none")).toBeTruthy();
  });
});
