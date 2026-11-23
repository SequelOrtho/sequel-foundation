// The no-sideways-scroll rule (DESIGN-CONVENTIONS §3 "A table people manage
// from fits its box"), as a browser check each hub runs from its own
// Playwright suite, at each width the layout changes at:
//
//   for (const width of FIT_WIDTHS) {
//     await page.setViewportSize({ width, height: 800 });
//     expect(await page.getByTestId("proposals-table").evaluate(fitsItsBox)).toEqual(FITS);
//   }
//
// A table that fits has nothing drawn past its box's right edge, a box that
// does not scroll sideways, and a page that does not either. A unit test
// cannot see any of that (jsdom lays nothing out), so the check is a browser
// one.
//
// fitsItsBox is sent to the page as source text, so it reads nothing outside
// its own body. Shipped as plain JavaScript (fit.mjs + fit.d.mts), like
// a11y.mjs. Edit both files together.

/** The widths a fitted table is checked at: a phone, a tablet, and both sides of `lg`. */
export const FIT_WIDTHS = [390, 768, 1024, 1280];

/** What fitsItsBox answers for a box that fits. */
export const FITS = { inside: true, box: true, page: true, overflowing: [] };

/**
 * Run in the page, on the box that holds the table:
 * `await locator.evaluate(fitsItsBox)`. `overflowing` names up to five
 * elements drawn past the box's right edge, so a failure says where to look.
 */
export function fitsItsBox(el) {
  const edge = el.getBoundingClientRect().right + 1;
  const name = (n) => {
    const cls = typeof n.className === "string" && n.className.trim() ? `.${n.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
    return `${n.tagName.toLowerCase()}${cls}`;
  };
  const past = [el, ...el.querySelectorAll("*")].filter((n) => n.getBoundingClientRect().right > edge);
  return {
    inside: past.length === 0,
    box: el.scrollWidth <= el.clientWidth + 1,
    page: document.documentElement.scrollWidth <= window.innerWidth,
    overflowing: past.slice(0, 5).map(name),
  };
}
