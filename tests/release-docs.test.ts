import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CLAUDE.md "Releasing", step 2: the version bump moves every #vX.Y.Z pin
// example in README.md and ADOPTING.md in the same pull request. The wrong
// version: package.json moves and the examples a new app copies stay on the
// last release (independent review of v0.38.0, 2026-11-10).
const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;

describe("release docs", () => {
  it.each(["README.md", "ADOPTING.md"])("%s: every pin example names this release", (file) => {
    const pins = [...readFileSync(file, "utf8").matchAll(/sequel-foundation#(v\d+\.\d+\.\d+)|`#(v\d+\.\d+\.\d+)`/g)].map((m) => m[1] ?? m[2]);
    expect(pins.length).toBeGreaterThan(0);
    expect([...new Set(pins)]).toEqual([`v${version}`]);
  });
});
