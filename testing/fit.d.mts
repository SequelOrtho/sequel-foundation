/** The widths a fitted table is checked at: a phone, a tablet, and both sides of `lg`. */
export declare const FIT_WIDTHS: readonly number[];
export interface FitResult {
    /** Nothing in the box is drawn past its right edge. */
    inside: boolean;
    /** The box itself does not scroll sideways. */
    box: boolean;
    /** The page does not scroll sideways. */
    page: boolean;
    /** Up to five elements drawn past the box's right edge (`tag.class.class`). */
    overflowing: string[];
}
/** What fitsItsBox answers for a box that fits. */
export declare const FITS: FitResult;
/**
 * The no-sideways-scroll check (DESIGN-CONVENTIONS §3 "A table people manage
 * from fits its box"). Run in the page, on the box that holds the table; with
 * Playwright:
 *
 *   expect(await page.getByTestId("proposals-table").evaluate(fitsItsBox)).toEqual(FITS);
 *
 * It is sent to the page as source text, so it reads nothing outside its own body.
 */
export declare function fitsItsBox(el: Element): FitResult;
