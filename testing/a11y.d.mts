/** The axe rule tags a hub scans: WCAG 2.0–2.2, levels A and AA. */
export declare const A11Y_TAGS: readonly ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
/** Impacts that fail the build. Moderate and minor are reported, not fatal. */
export declare const BLOCKING_IMPACTS: readonly ["serious", "critical"];
export type AxeImpact = "minor" | "moderate" | "serious" | "critical";
/** The parts of an axe-core result this module reads. */
export interface AxeViolation {
    id: string;
    impact?: AxeImpact | null;
    help: string;
    helpUrl: string;
    nodes: {
        target: unknown[];
        failureSummary?: string;
    }[];
}
export interface AxeResultsLike {
    violations: AxeViolation[];
}
export interface BlockingOptions {
    /** Impacts that fail; defaults to serious and critical. */
    impacts?: readonly AxeImpact[];
    /**
     * Rule ids accepted for now, each with the reason. A reason is required so
     * an exception is a decision someone wrote down, never a quiet skip.
     */
    allow?: Record<string, string>;
}
/** The violations that should fail the build. */
export declare function blockingViolations(results: AxeResultsLike, options?: BlockingOptions): AxeViolation[];
/** A readable report: one block per rule, up to five elements each. */
export declare function formatViolations(violations: AxeViolation[], label?: string): string;
/**
 * The same-origin pages a page links to, deduplicated, without fragments.
 * Off-site links are left out on purpose: a third-party outage must not fail
 * a hub's build, and Cloudflare-fronted Sequel domains refuse CI clients.
 */
export declare function sameOriginLinks(hrefs: readonly (string | null | undefined)[], pageUrl: string): string[];
export interface LinkResult {
    url: string;
    status: number;
    /** Set when the request itself failed (network, timeout). */
    error?: string;
}
/** Broken = the request failed, or the final answer (after redirects) is 400 or above. */
export declare function isBrokenLink(result: LinkResult): boolean;
/**
 * Fetches each link (following redirects) a few at a time and returns the
 * broken ones. `fetcher` returns the final status; with Playwright, whose
 * `page.request` carries the signed-in test session (plain `fetch` does not):
 * `async (url) => ({ status: (await page.request.get(url)).status() })`.
 */
export declare function findBrokenLinks(urls: readonly string[], fetcher: (url: string) => Promise<{
    status: number;
}>, { concurrency }?: {
    concurrency?: number;
}): Promise<LinkResult[]>;
/** A readable report of broken links, naming the page they were found on. */
export declare function formatBrokenLinks(broken: LinkResult[], foundOn: string): string;
/**
 * Script for Playwright's `page.addInitScript` that pins the theme before the
 * page loads, so a scan runs in light AND dark: `addInitScript(themeInitFor(key, "dark"))`.
 * `storageKey` is the app's theme key (lib/theme.ts).
 */
export declare function themeInitFor(storageKey: string, mode: "light" | "dark"): string;
