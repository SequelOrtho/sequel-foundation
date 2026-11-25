// Which Chromium a hub's Playwright suite launches (DESIGN-CONVENTIONS §8
// "The browser check starts on any machine").
//
// A hub pins @playwright/test, and each Playwright release looks for one exact
// Chromium build. CI and a laptop install that build (`npx playwright
// install`). A Claude Code cloud session cannot: it ships one Chromium, at
// /opt/pw-browsers/chromium, for whatever Playwright the machine was built
// with. So in every session the suite failed to launch until someone pointed
// it at the installed browser by hand. One line in playwright.config.ts ends
// that:
//
//   import { chromium, defineConfig, devices } from "@playwright/test";
//   import { chromiumLaunchOptions } from "@sequel/foundation/testing/browser";
//
//   projects: [{
//     name: "chromium",
//     use: { ...devices["Desktop Chrome"], launchOptions: chromiumLaunchOptions(chromium.executablePath()) },
//   }],
//
// The pinned build wins wherever it exists, so CI and laptops are unchanged.
// Only when it is missing AND another Chromium is on the machine does the
// suite run on that one. PW_CHROMIUM_PATH names a different one.
//
// Shipped as plain JavaScript (browser.mjs + browser.d.mts), like a11y.mjs,
// so Playwright can load it from node_modules. It imports nothing from
// Playwright: the caller passes the pinned path in. Edit both files together.

import { existsSync } from "node:fs";

/** Where a Claude Code cloud session keeps its one Chromium. */
export const CLOUD_CHROMIUM_PATH = "/opt/pw-browsers/chromium";

/** The environment variable that names another Chromium to fall back to. */
export const CHROMIUM_PATH_ENV = "PW_CHROMIUM_PATH";

/**
 * The Chromium to launch instead of the pinned build, or undefined to launch
 * the pinned build. `pinnedPath` is `chromium.executablePath()`.
 */
export function fallbackChromiumPath(pinnedPath, { env = process.env, exists = existsSync } = {}) {
  if (pinnedPath && exists(pinnedPath)) return undefined;
  const fallback = env[CHROMIUM_PATH_ENV] || CLOUD_CHROMIUM_PATH;
  return exists(fallback) ? fallback : undefined;
}

/**
 * Playwright `launchOptions` for the chromium project: `{ executablePath }`
 * when the pinned build is missing and another Chromium is there, else `{}`.
 * Spread it beside a hub's own launch options.
 */
export function chromiumLaunchOptions(pinnedPath, options) {
  const executablePath = fallbackChromiumPath(pinnedPath, options);
  return executablePath ? { executablePath } : {};
}
