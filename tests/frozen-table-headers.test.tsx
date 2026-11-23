// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrozenTableHeaders } from "../ui/FrozenTableHeaders";
import { FROZEN_KEEP_PX } from "../ui/frozen-header";

// jsdom lays nothing out, so each test says where the table sits in the
// window and the component is driven through its real listeners.
type Box = { top: number; height: number };
const boxes = new Map<Element, Box>();
const heights = new Map<Element, number>();
const hidden = new Set<Element>();
let frames: FrameRequestCallback[] = [];
const flush = () => {
  const run = frames;
  frames = [];
  for (const f of run) f(0);
};

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => void (frames[id - 1] = () => {}));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const b = boxes.get(this) ?? { top: 0, height: 0 };
    return { top: b.top, bottom: b.top + b.height, height: b.height, left: 0, right: 0, width: 0, x: 0, y: b.top, toJSON: () => ({}) };
  });
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) {
    return hidden.has(this) ? null : document.body;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return heights.get(this) ?? 0;
  });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  boxes.clear();
  heights.clear();
  hidden.clear();
  frames = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function table(html = "", wrap = "") {
  const host = document.createElement("div");
  host.innerHTML = `<div ${wrap}><table><thead ${html}><tr><th class="first">Name</th><th>Owner</th></tr></thead><tbody><tr><td><button>Edit</button></td><td>x</td></tr></tbody></table></div>`;
  document.body.append(host);
  const t = host.querySelector("table")!;
  const head = t.tHead!;
  heights.set(head, 40);
  return { t, head, cells: [...head.querySelectorAll("th")] as HTMLElement[], wrapper: host.firstElementChild as HTMLElement };
}
/** Where the table sits in the window; its header row starts `caption` px below the table's top. */
const place = (t: HTMLTableElement, top: number, height = 900, caption = 0) => {
  boxes.set(t, { top, height });
  boxes.set(t.tHead!, { top: top + caption, height: heights.get(t.tHead!) ?? 40 });
};
const scroll = () => {
  window.dispatchEvent(new Event("scroll"));
  flush();
};

describe("FrozenTableHeaders", () => {
  it("freezes a header once its table's top is above the window, and lets go back at the top", () => {
    const { t, head } = table();
    place(t, 120);
    render(<FrozenTableHeaders />);
    flush();
    expect(head.hasAttribute("data-frozen")).toBe(false);

    place(t, -300);
    scroll();
    expect(head.hasAttribute("data-frozen")).toBe(true);
    expect(head.style.getPropertyValue("--frozen-offset")).toBe("300px");

    place(t, 0);
    scroll();
    expect(head.hasAttribute("data-frozen")).toBe(false);
    expect(head.style.getPropertyValue("--frozen-offset")).toBe("");
  });

  it("the header leaves with its table: the offset stops above the last row, and goes when the table has passed", () => {
    const { t, head } = table();
    render(<FrozenTableHeaders />);
    // the table's bottom is still in the window for this pass
    place(t, -880);
    scroll();
    expect(head.style.getPropertyValue("--frozen-offset")).toBe(`${900 - 40 - FROZEN_KEEP_PX}px`);
    place(t, -950);
    scroll();
    expect(head.hasAttribute("data-frozen")).toBe(false);
  });

  it("leaves alone a header that is already sticky", () => {
    const { t, head } = table('style="position: sticky"');
    place(t, -300);
    render(<FrozenTableHeaders />);
    flush();
    expect(head.hasAttribute("data-frozen")).toBe(false);
  });

  it("leaves alone a table inside a box that scrolls up and down by itself", () => {
    const { t, head, wrapper } = table("", 'style="overflow-y: auto"');
    Object.defineProperty(wrapper, "scrollHeight", { value: 900 });
    Object.defineProperty(wrapper, "clientHeight", { value: 300 });
    place(t, -300);
    render(<FrozenTableHeaders />);
    flush();
    expect(head.hasAttribute("data-frozen")).toBe(false);
  });

  it("freezes a table in a sideways-only scroller (the case a CSS sticky header cannot follow)", () => {
    const { t, head } = table("", 'style="overflow-x: auto"');
    place(t, -300);
    render(<FrozenTableHeaders />);
    flush();
    expect(head.hasAttribute("data-frozen")).toBe(true);
  });

  it("leaves alone a header that is not drawn", () => {
    const { t, head } = table();
    hidden.add(head);
    place(t, -300);
    render(<FrozenTableHeaders />);
    flush();
    expect(head.hasAttribute("data-frozen")).toBe(false);
  });

  it("marks a header cell that is itself sticky, so a held first column keeps its hold, and unmarks it on release", () => {
    const { t, head, cells } = table();
    cells[0].style.position = "sticky";
    place(t, -300);
    render(<FrozenTableHeaders />);
    flush();
    expect(cells[0].hasAttribute("data-frozen-sticky")).toBe(true);
    expect(cells[1].hasAttribute("data-frozen-sticky")).toBe(false);
    place(t, 10);
    scroll();
    expect(head.hasAttribute("data-frozen")).toBe(false);
    expect(cells[0].hasAttribute("data-frozen-sticky")).toBe(false);
  });

  it("reads the sticky cells again after a resize (a breakpoint can change them)", () => {
    const { t, cells } = table();
    place(t, -300);
    render(<FrozenTableHeaders />);
    flush();
    expect(cells[0].hasAttribute("data-frozen-sticky")).toBe(false);
    cells[0].style.position = "sticky";
    scroll();
    expect(cells[0].hasAttribute("data-frozen-sticky")).toBe(false);
    window.dispatchEvent(new Event("resize"));
    flush();
    expect(cells[0].hasAttribute("data-frozen-sticky")).toBe(true);
  });

  it("scrolls a focused control clear of the frozen header (WCAG 2.4.11)", () => {
    const { t, head, cells } = table();
    const button = t.querySelector("button")!;
    place(t, -300);
    boxes.set(cells[0], { top: 0, height: 40 });
    boxes.set(button, { top: 30, height: 24 });
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    render(<FrozenTableHeaders />);
    flush();
    expect(head.hasAttribute("data-frozen")).toBe(true);
    button.focus();
    flush();
    expect(scrollBy).toHaveBeenCalledWith({ top: -14 });

    scrollBy.mockClear();
    boxes.set(button, { top: 80, height: 24 });
    button.blur();
    button.focus();
    flush();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("clears a header of two rows by its lowest row, not its first cell", () => {
    const { t, head, cells } = table();
    const second = document.createElement("tr");
    second.innerHTML = "<th>Mon</th><th>Tue</th>";
    head.append(second);
    const button = t.querySelector("button")!;
    place(t, -300);
    boxes.set(cells[0], { top: 0, height: 30 });
    for (const th of second.querySelectorAll("th")) boxes.set(th, { top: 30, height: 24 });
    // Clear of the first row (bottom 30), under the second (bottom 54).
    boxes.set(button, { top: 40, height: 24 });
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    render(<FrozenTableHeaders />);
    flush();
    button.focus();
    flush();
    expect(scrollBy).toHaveBeenCalledWith({ top: -18 });
  });

  it("measures from the header row, not the table: a caption above it leaves no gap", () => {
    const { t, head } = table();
    render(<FrozenTableHeaders />);
    // The table's top is 20px above the window, its header row still 10px inside it.
    place(t, -20, 900, 30);
    scroll();
    expect(head.hasAttribute("data-frozen")).toBe(false);
    // 300px up: the header row was drawn at -270, so it moves 270, not 300.
    place(t, -300, 900, 30);
    scroll();
    expect(head.style.getPropertyValue("--frozen-offset")).toBe("270px");
  });

  it("leaves alone a header whose cells are sticky to the top (it follows the page by itself)", () => {
    const { t, head, cells } = table();
    for (const c of cells) {
      c.style.position = "sticky";
      c.style.top = "0px";
    }
    place(t, -300);
    render(<FrozenTableHeaders />);
    flush();
    expect(head.hasAttribute("data-frozen")).toBe(false);
    expect(cells[0].hasAttribute("data-frozen-sticky")).toBe(false);
  });

  it("follows a table that changes with no scroll: rows removed, the header lets go", async () => {
    const { t, head } = table();
    place(t, -300);
    render(<FrozenTableHeaders />);
    flush();
    expect(head.style.getPropertyValue("--frozen-offset")).toBe("300px");
    // A filter removes the rows: the table now ends above the window. No scroll event.
    t.tBodies[0].replaceChildren();
    place(t, -300, 100);
    await Promise.resolve();
    flush();
    expect(head.hasAttribute("data-frozen")).toBe(false);
  });

  it("picks up a table that arrives while the page is scrolled, with no scroll", async () => {
    render(<FrozenTableHeaders />);
    flush();
    const proto = HTMLElement.prototype.getBoundingClientRect as unknown as { mockImplementation: (f: unknown) => void };
    // Any table that arrives is already 300px above the window.
    proto.mockImplementation(function (this: HTMLElement) {
      const b = boxes.get(this) ?? (this.matches("table, thead") ? { top: -300, height: 900 } : { top: 0, height: 0 });
      return { top: b.top, bottom: b.top + b.height, height: b.height, left: 0, right: 0, width: 0, x: 0, y: b.top, toJSON: () => ({}) };
    });
    const { head } = table();
    await Promise.resolve();
    flush();
    expect(head.hasAttribute("data-frozen")).toBe(true);
  });

  it("freezes under a bar fixed to the top of the window (data-frozen-inset), not behind it", () => {
    const { t, head } = table();
    const bar = document.createElement("div");
    bar.setAttribute("data-frozen-inset", "");
    document.body.append(bar);
    boxes.set(bar, { top: 0, height: 48 });
    render(<FrozenTableHeaders />);
    // The header row is at 20: in the window, but behind the bar.
    place(t, 20);
    scroll();
    expect(head.style.getPropertyValue("--frozen-offset")).toBe("28px");
    place(t, -300);
    scroll();
    expect(head.style.getPropertyValue("--frozen-offset")).toBe("348px");
    // A bar that is not drawn, or not at the top, takes no room.
    boxes.set(bar, { top: 400, height: 48 });
    scroll();
    expect(head.style.getPropertyValue("--frozen-offset")).toBe("300px");
  });

  it("unmounting releases every header and stops listening", () => {
    const { t, head } = table();
    place(t, -300);
    const view = render(<FrozenTableHeaders />);
    flush();
    expect(head.hasAttribute("data-frozen")).toBe(true);
    view.unmount();
    expect(head.hasAttribute("data-frozen")).toBe(false);
    scroll();
    expect(head.hasAttribute("data-frozen")).toBe(false);
  });
});
