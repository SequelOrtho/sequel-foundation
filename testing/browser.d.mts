/** Where a Claude Code cloud session keeps its one Chromium. */
export declare const CLOUD_CHROMIUM_PATH: string;
/** The environment variable that names another Chromium to fall back to. */
export declare const CHROMIUM_PATH_ENV: string;
export interface ChromiumFallbackOptions {
    /** Defaults to `process.env`. */
    env?: Record<string, string | undefined>;
    /** Defaults to `fs.existsSync`. */
    exists?: (path: string) => boolean;
}
/**
 * The Chromium to launch instead of the pinned build, or undefined to launch
 * the pinned build. `pinnedPath` is `chromium.executablePath()`.
 */
export declare function fallbackChromiumPath(pinnedPath: string | undefined, options?: ChromiumFallbackOptions): string | undefined;
/**
 * Playwright `launchOptions` for the chromium project (DESIGN-CONVENTIONS §8
 * "The browser check starts on any machine"):
 *
 *   launchOptions: chromiumLaunchOptions(chromium.executablePath())
 *
 * `{ executablePath }` when the pinned build is missing and another Chromium
 * is on the machine (a Claude Code cloud session), else `{}`.
 */
export declare function chromiumLaunchOptions(pinnedPath: string | undefined, options?: ChromiumFallbackOptions): { executablePath?: string };
