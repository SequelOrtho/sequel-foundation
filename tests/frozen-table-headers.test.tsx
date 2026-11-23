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
const place = (t: Element, top: number, height = 900) => boxes.set(t, { top, height });
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
    place(t, -5000);
    // bottom is still in the window for this pass
    boxes.set(t, { top: -880, height: 900 });
    scroll();
    expect(head.style.getPropertyValue("--frozen-offset")).toBe(`${900 - 40 - FROZEN_KEEP_PX}px`);
    boxes.set(t, { top: -950, height: 900 });
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
