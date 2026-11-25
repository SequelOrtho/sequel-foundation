import { describe, expect, it } from "vitest";
import {
  CHROMIUM_PATH_ENV,
  CLOUD_CHROMIUM_PATH,
  chromiumLaunchOptions,
  fallbackChromiumPath,
} from "../testing/browser.mjs";

const PINNED = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const on = (...paths: string[]) => ({ env: {}, exists: (p: string) => paths.includes(p) });

describe("fallbackChromiumPath", () => {
  it("launches the pinned build wherever it exists (CI, a laptop)", () => {
    expect(fallbackChromiumPath(PINNED, on(PINNED, CLOUD_CHROMIUM_PATH))).toBeUndefined();
  });

  it("falls back to the cloud session's Chromium when the pinned build is missing", () => {
    expect(fallbackChromiumPath(PINNED, on(CLOUD_CHROMIUM_PATH))).toBe(CLOUD_CHROMIUM_PATH);
  });

  it("changes nothing when neither is there, so Playwright's own install message shows", () => {
    expect(fallbackChromiumPath(PINNED, on())).toBeUndefined();
  });

  it("takes another Chromium from the environment variable", () => {
    const other = "/usr/bin/chromium";
    const options = { env: { [CHROMIUM_PATH_ENV]: other }, exists: (p: string) => p === other || p === CLOUD_CHROMIUM_PATH };
    expect(fallbackChromiumPath(PINNED, options)).toBe(other);
  });

  it("ignores an environment path that does not exist, and an empty one", () => {
    const missing = { env: { [CHROMIUM_PATH_ENV]: "/nope" }, exists: (p: string) => p === CLOUD_CHROMIUM_PATH };
    expect(fallbackChromiumPath(PINNED, missing)).toBeUndefined();
    const empty = { env: { [CHROMIUM_PATH_ENV]: "" }, exists: (p: string) => p === CLOUD_CHROMIUM_PATH };
    expect(fallbackChromiumPath(PINNED, empty)).toBe(CLOUD_CHROMIUM_PATH);
  });

  it("the environment variable never overrides a pinned build that exists", () => {
    const options = { env: { [CHROMIUM_PATH_ENV]: "/usr/bin/chromium" }, exists: () => true };
    expect(fallbackChromiumPath(PINNED, options)).toBeUndefined();
  });

  it("treats no pinned path as missing", () => {
    expect(fallbackChromiumPath(undefined, on(CLOUD_CHROMIUM_PATH))).toBe(CLOUD_CHROMIUM_PATH);
  });
});

describe("chromiumLaunchOptions", () => {
  it("is empty when the pinned build is used, so it spreads beside a hub's own options", () => {
    expect(chromiumLaunchOptions(PINNED, on(PINNED))).toEqual({});
  });

  it("carries the fallback as executablePath", () => {
    expect(chromiumLaunchOptions(PINNED, on(CLOUD_CHROMIUM_PATH))).toEqual({ executablePath: CLOUD_CHROMIUM_PATH });
  });

  it("reads the real machine by default", () => {
    expect(chromiumLaunchOptions(process.execPath)).toEqual({});
  });
});
