// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { FITS, FIT_WIDTHS, fitsItsBox } from "../testing/fit.mjs";

// jsdom lays nothing out, so each element is told where its right edge is.
function box(html: string, rights: Record<string, number>, scrollWidth = 600) {
  document.body.innerHTML = `<div id="box">${html}</div>`;
  const el = document.getElementById("box")!;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const right = this === el ? 600 : (rights[this.id] ?? 600);
    return { right, left: 0, top: 0, bottom: 0, width: right, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  });
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: 600, configurable: true });
  return el;
}
const page = (scrollWidth: number) => {
  Object.defineProperty(document.documentElement, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
};

afterEach(() => vi.restoreAllMocks());

describe("fitsItsBox", () => {
  it("a table inside its box, in a box and a page that do not scroll sideways, fits", () => {
    page(1024);
    expect(fitsItsBox(box(`<table id="t"><tr><td id="c">x</td></tr></table>`, { t: 600, c: 600.9 }))).toEqual(FITS);
  });

  it("names what is drawn past the box's right edge", () => {
    page(1024);
    const r = fitsItsBox(box(`<table id="t" class="min-w-[900px] text-sm"><tr><td id="c">x</td></tr></table>`, { t: 900, c: 900 }));
    expect(r.inside).toBe(false);
    expect(r.overflowing).toEqual(["table.min-w-[900px].text-sm", "td"]);
  });

  it("a box that scrolls sideways does not fit, even with everything clipped inside it", () => {
    page(1024);
    expect(fitsItsBox(box(`<table id="t"></table>`, {}, 900))).toEqual({ ...FITS, box: false });
  });

  it("a page that scrolls sideways does not fit", () => {
    page(1322);
    expect(fitsItsBox(box(`<table id="t"></table>`, {}))).toEqual({ ...FITS, page: false });
  });

  it("reads nothing outside its own body, so it can be sent to a browser as text", () => {
    const sent = new Function(`return (${fitsItsBox.toString()})`)() as typeof fitsItsBox;
    page(1024);
    expect(sent(box(`<p id="p">x</p>`, { p: 700 })).overflowing).toEqual(["p"]);
  });

  it("checks a phone, a tablet and both sides of lg", () => {
    expect(FIT_WIDTHS).toEqual([390, 768, 1024, 1280]);
  });
});
