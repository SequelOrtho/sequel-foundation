/** Overflow classes that make a box scroll sideways (both axes included). */
export declare const HORIZONTAL_SCROLL_CLASSES: readonly ["overflow-x-auto", "overflow-x-scroll", "overflow-auto", "overflow-scroll"];
/** Vertical-only scrollers, checked with `{ vertical: true }`. */
export declare const VERTICAL_SCROLL_CLASSES: readonly ["overflow-y-auto", "overflow-y-scroll"];
/** Classes that make a box a containing block for absolute children. */
export declare const POSITION_CLASSES: readonly ["relative", "absolute", "fixed", "sticky"];
export interface SourceFile {
    /** Shown in the report; also the key for `allow`. */
    path: string;
    source: string;
}
export interface UnpositionedScroller {
    path: string;
    /** 1-based line of the overflow class. */
    line: number;
    /** The overflow class as written, variant prefix included (`sm:overflow-x-auto`). */
    scroller: string;
    /** The string literal it sits in. */
    classes: string;
}
export interface ScrollerOptions {
    /** Also check `overflow-y-auto` / `overflow-y-scroll`. Default false. */
    vertical?: boolean;
    /**
     * `path` or `path:line` keys accepted for now, each with the reason. A
     * reason is required so an exception is a decision someone wrote down.
     */
    allow?: Record<string, string>;
}
/**
 * Every class string in `files` that scrolls and carries none of
 * POSITION_CLASSES unprefixed — a wrapper sr-only text would escape on a
 * phone (DESIGN-CONVENTIONS §3 "A scrolling wrapper is positioned"). In a
 * hub's vitest suite:
 *
 *   const files = collectSourceFiles(process.cwd(), ["app", "components"]);
 *   const hits = findUnpositionedScrollers(files);
 *   expect(hits, formatUnpositionedScrollers(hits)).toEqual([]);
 */
export declare function findUnpositionedScrollers(files: readonly SourceFile[], options?: ScrollerOptions): UnpositionedScroller[];
/** A readable report: one line per hit, with the fix. */
export declare function formatUnpositionedScrollers(hits: readonly UnpositionedScroller[]): string;
/**
 * The `.tsx` / `.jsx` / `.ts` / `.js` / `.mjs` files under `dirs` (relative to
 * `root`), as `{ path, source }` with `path` relative to `root`. Skips
 * node_modules, .next, dot folders and `.d.ts` files.
 */
export declare function collectSourceFiles(root: string, dirs: readonly string[], extensions?: readonly string[]): SourceFile[];
