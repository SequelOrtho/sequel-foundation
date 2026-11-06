import type { SourceFile } from "./scrollers.mjs";
export { collectSourceFiles } from "./scrollers.mjs";
export type { SourceFile } from "./scrollers.mjs";

/** Module specifiers that fetch fonts from Google at build time. */
export declare const GOOGLE_FONT_MODULES: readonly ["next/font/google", "@next/font/google"];
export interface GoogleFontImport {
    /** Shown in the report; also the key for `allow`. */
    path: string;
    /** 1-based line of the module specifier. */
    line: number;
    /** The specifier as written (`next/font/google`, or a subpath). */
    module: string;
    /** The source line it sits on, trimmed. */
    statement: string;
}
export interface GoogleFontOptions {
    /**
     * `path` or `path:line` keys accepted for now, each with the reason. A
     * reason is required so an exception is a decision someone wrote down.
     */
    allow?: Record<string, string>;
}
/**
 * Every `next/font/google` (or `@next/font/google`) module reference in
 * `files` — static, side-effect, re-export, dynamic `import()` and
 * `require()`, any quote style (DESIGN-CONVENTIONS §1 "Fonts are local").
 * In a hub's vitest suite:
 *
 *   const files = collectSourceFiles(process.cwd(), ["app", "components", "lib"]);
 *   const hits = findGoogleFontImports(files);
 *   expect(hits, formatGoogleFontImports(hits)).toEqual([]);
 */
export declare function findGoogleFontImports(files: readonly SourceFile[], options?: GoogleFontOptions): GoogleFontImport[];
/** A readable report: one line per hit, with the fix. */
export declare function formatGoogleFontImports(hits: readonly GoogleFontImport[]): string;
