import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The review gate holds a token that can write commit statuses on a hub, on a
// `pull_request_target` run. These tests pin the shape that keeps that safe.
// The wrong versions: a checkout of the calling repository or of a pull
// request's head, an install step, an input that says which pull request to
// judge, a wider token, or a checkout that falls back to a branch.
const code = (path: string) => readFileSync(path, "utf8").replace(/^\s*#.*$/gm, "");
const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;

describe("the reusable review-gate workflow", () => {
  const src = code(".github/workflows/review-gate.yml");

  it("can only be called, with no inputs and no secrets", () => {
    expect(src).toMatch(/\non:\n  workflow_call:\n\npermissions: \{\}\n/);
    expect(src).not.toMatch(/inputs:|secrets:|workflow_dispatch|\n  pull_request(_target)?:|\n  issue_comment:|\n  push:|\n  schedule:/);
  });

  it("holds read access and the status write, nothing else, and has a time limit", () => {
    const job = src.slice(src.indexOf("\n  gate:"));
    const perms = job.slice(job.indexOf("    permissions:"), job.indexOf("    steps:"));
    expect(perms.trim().split("\n").map((l) => l.trim())).toEqual(["permissions:", "contents: read", "pull-requests: read", "issues: read", "statuses: write"]);
    expect(job).toMatch(/\n    timeout-minutes: 5\n/);
    expect(job).toMatch(/\n    runs-on: ubuntu-24\.04\n/);
  });

  it("checks out this repository only, at the workflow's own commit, and stops when that commit is unknown", () => {
    const uses = [...src.matchAll(/- uses: (\S+)/g)].map((m) => m[1]);
    expect(uses).toEqual(["actions/checkout@v4", "actions/setup-node@v4"]);
    expect(src).toMatch(/GATE_REPOSITORY: \$\{\{ job\.workflow_repository \}\}/);
    expect(src).toMatch(/GATE_SHA: \$\{\{ job\.workflow_sha \}\}/);
    expect(src).toMatch(/if \[ "\$GATE_REPOSITORY" != "SequelOrtho\/sequel-foundation" \]; then\n.*\n\s+exit 1/);
    expect(src).toMatch(/if ! printf '%s' "\$GATE_SHA" \| grep -Eq '\^\[0-9a-f\]\{40\}\$'; then\n.*\n\s+exit 1/);
    const checkout = src.slice(src.indexOf("- uses: actions/checkout@v4"), src.indexOf("- uses: actions/setup-node@v4"));
    expect(checkout).toMatch(/repository: SequelOrtho\/sequel-foundation\n/);
    expect(checkout).toMatch(/ref: \$\{\{ steps\.pin\.outputs\.sha \}\}\n/);
    expect(checkout).toMatch(/persist-credentials: false/);
    // The pin step comes before the checkout.
    expect(src.indexOf("id: pin")).toBeLessThan(src.indexOf("- uses: actions/checkout@v4"));
  });

  it("runs the gate script and nothing from a pull request", () => {
    const runs = [...src.matchAll(/\n\s+- run: (.+)/g)].map((m) => m[1].trim());
    expect(runs).toEqual(["node review-gate/review-gate.mjs"]);
    expect([...src.matchAll(/\n\s+run: \|/g)]).toHaveLength(1); // the pin step
    expect(src).not.toMatch(/head\.(sha|ref)|refs\/pull|npm (ci|install)|npx |github\.repository\b|github\.sha|github\.ref\b/);
    expect(src).toMatch(/PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \|\| github\.event\.issue\.number \}\}/);
    expect(src).toMatch(/DEFAULT_BRANCH: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  });
});

describe("the caller a hub copies (review-gate/caller.yml)", () => {
  const src = code("review-gate/caller.yml");

  it("runs on pull requests into main and on PR comments, never on the pull request's own copy", () => {
    expect(src).toMatch(/\n  pull_request_target:\n\s+branches: \[main\]\n\s+types: \[opened, reopened, synchronize, ready_for_review\]/);
    expect(src).toMatch(/\n  issue_comment:\n\s+types: \[created, edited, deleted\]/);
    expect(src).not.toMatch(/\n  pull_request:|workflow_dispatch/);
    expect(src).toMatch(/group: review-gate-\$\{\{ github\.event\.pull_request\.number \|\| github\.event\.issue\.number \}\}/);
    expect(src).toMatch(/if: github\.event_name == 'pull_request_target' \|\| github\.event\.issue\.pull_request/);
  });

  it("has no steps of its own and passes on only the gate's permissions", () => {
    expect(src).not.toMatch(/steps:|- uses:|\brun:|secrets:|with:/);
    expect(src).toMatch(/\npermissions: \{\}\n/);
    const job = src.slice(src.indexOf("\n  gate:"));
    const perms = job.slice(job.indexOf("    permissions:"), job.indexOf("    uses:"));
    expect(perms.trim().split("\n").map((l) => l.trim())).toEqual(["permissions:", "contents: read", "pull-requests: read", "issues: read", "statuses: write"]);
  });

  // The wrong versions: a pin on a branch (it moves with every merge), on a
  // release from before the gate existed or one not cut yet, or docs that show
  // a different pin from the file hubs copy. Tags are safe to pin because
  // release tags are protected (docs/REVIEW-GATE.md); the docs must say so.
  it("pins an exact release that carries the gate, the same one the docs show", () => {
    const pins = [...src.matchAll(/\n    uses: (\S+)@(\S+)/g)];
    expect(pins).toHaveLength(1);
    expect(pins[0][1]).toBe("SequelOrtho/sequel-foundation/.github/workflows/review-gate.yml");
    const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(pins[0][2]);
    expect(m, pins[0][2]).not.toBeNull();
    const num = (v: string[]) => Number(v[0]) * 1e6 + Number(v[1]) * 1e3 + Number(v[2]);
    expect(num(m!.slice(1, 4))).toBeGreaterThanOrEqual(num(["0", "38", "0"]));
    expect(num(m!.slice(1, 4))).toBeLessThanOrEqual(num(version.split(".")));
    const docs = readFileSync("docs/REVIEW-GATE.md", "utf8");
    expect(docs).toContain(`review-gate.yml@${pins[0][2]}`);
    expect(docs).toMatch(/tag ruleset/);
    // The ruleset stops a tag being moved, not being created early on the
    // wrong commit: the docs must carry the check that catches that, and the
    // hub's own copy must send its reader to both (independent review).
    // By the tag's full name: a short name also lists look-alike tags
    // (refs/tags/a/vX.Y.Z) that could point at the right commit instead.
    expect(docs).toMatch(/git ls-remote --tags https:\/\/github\.com\/SequelOrtho\/sequel-foundation refs\/tags\/vX\.Y\.Z/);
    expect(docs).not.toMatch(/ls-remote --tags \S+ vX\.Y\.Z/);
    expect(docs).toMatch(/git merge-base --is-ancestor <id> origin\/main/);
    expect(docs).toMatch(/does not stop[\s\S]{0,120}creating a release's tag early/);
    expect(readFileSync("review-gate/caller.yml", "utf8")).toMatch(/safe only while release\s+#?\s*tags there are protected/);
  });
});
