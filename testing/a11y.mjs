// Accessibility and link checks for each hub's CI (owner ruling 2026-10-21,
// Mike: "Approved … 5-yes", UX audit Q5 / FND-22). The browser glue lives in
// the app's own Playwright test (it owns Playwright, @axe-core/playwright and
// how it signs in); this module holds the parts every hub shares, so the rule
// for what fails a build is written once: which WCAG tags are scanned, which
// impacts block, how a failure reads, which links on a page are checked and
// what counts as broken. No Playwright or axe import here — the types below
// are the shape of axe-core's results, so the package gains no dependency.
//
// Shipped as plain JavaScript (a11y.mjs + a11y.d.mts), unlike the rest of
// the package: Playwright loads test files with Node, which refuses to strip
// TypeScript types from a file under node_modules, so a .ts helper here would
// fail to load in every hub's e2e suite. Edit both files together.
//
// Automated checks catch roughly a third to a half of accessibility problems.
// They are a floor that stops regressions, not a substitute for a keyboard
// pass (DESIGN-CONVENTIONS §6).
/** The axe rule tags a hub scans: WCAG 2.0–2.2, levels A and AA. */
export const A11Y_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
/** Impacts that fail the build. Moderate and minor are reported, not fatal. */
export const BLOCKING_IMPACTS = ["serious", "critical"];
/** The violations that should fail the build. */
export function blockingViolations(results, options = {}) {
    const impacts = new Set(options.impacts ?? BLOCKING_IMPACTS);
    const allow = options.allow ?? {};
    for (const [rule, reason] of Object.entries(allow)) {
        if (!reason.trim())
            throw new Error(`a11y allow-list entry "${rule}" needs a reason`);
    }
    return results.violations.filter((v) => impacts.has(v.impact ?? "") && !(v.id in allow));
}
/** A readable report: one block per rule, up to five elements each. */
export function formatViolations(violations, label = "page") {
    if (violations.length === 0)
        return `${label}: no blocking accessibility issues`;
    const lines = [`${label}: ${violations.length} blocking accessibility issue(s)`];
    for (const v of violations) {
        lines.push(`- [${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.helpUrl})`);
        for (const node of v.nodes.slice(0, 5)) {
            lines.push(`    at ${node.target.map(String).join(" ")}`);
        }
        if (v.nodes.length > 5)
            lines.push(`    …and ${v.nodes.length - 5} more`);
    }
    return lines.join("\n");
}
/** Links that are never fetched: other schemes, in-page anchors, downloads of mail. */
const SKIP_SCHEME = /^(mailto|tel|sms|javascript|data|blob):/i;
/**
 * The same-origin pages a page links to, deduplicated, without fragments.
 * Off-site links are left out on purpose: a third-party outage must not fail
 * a hub's build, and Cloudflare-fronted Sequel domains refuse CI clients.
 */
export function sameOriginLinks(hrefs, pageUrl) {
    const base = new URL(pageUrl);
    const seen = new Set();
    for (const raw of hrefs) {
        const href = raw?.trim();
        if (!href || href.startsWith("#") || SKIP_SCHEME.test(href))
            continue;
        let url;
        try {
            url = new URL(href, base);
        }
        catch {
            continue;
        }
        if (url.origin !== base.origin)
            continue;
        url.hash = "";
        seen.add(url.toString());
    }
    return [...seen].sort();
}
/** Broken = the request failed, or the final answer (after redirects) is 400 or above. */
export function isBrokenLink(result) {
    return Boolean(result.error) || result.status >= 400 || result.status === 0;
}
/**
 * Fetches each link (following redirects) a few at a time and returns the
 * broken ones. `fetcher` returns the final status; with Playwright, whose
 * `page.request` carries the signed-in test session (plain `fetch` does not):
 * `async (url) => ({ status: (await page.request.get(url)).status() })`.
 */
export async function findBrokenLinks(urls, fetcher, { concurrency = 4 } = {}) {
    const results = [];
    let next = 0;
    async function worker() {
        while (next < urls.length) {
            const url = urls[next++];
            try {
                const res = await fetcher(url);
                results.push({ url, status: res.status });
            }
            catch (e) {
                results.push({ url, status: 0, error: e instanceof Error ? e.message : String(e) });
            }
        }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, urls.length)) }, worker));
    return results.filter(isBrokenLink).sort((a, b) => a.url.localeCompare(b.url));
}
/** A readable report of broken links, naming the page they were found on. */
export function formatBrokenLinks(broken, foundOn) {
    if (broken.length === 0)
        return `${foundOn}: no broken links`;
    return [
        `${foundOn}: ${broken.length} broken link(s)`,
        ...broken.map((b) => `- ${b.url} → ${b.error ? `failed (${b.error})` : b.status}`),
    ].join("\n");
}
/**
 * Script for Playwright's `page.addInitScript` that pins the theme before the
 * page loads, so a scan runs in light AND dark: `addInitScript(themeInitFor(key, "dark"))`.
 * `storageKey` is the app's theme key (lib/theme.ts).
 */
export function themeInitFor(storageKey, mode) {
    return `try{localStorage.setItem(${JSON.stringify(storageKey)},${JSON.stringify(mode)})}catch(e){}`;
}
