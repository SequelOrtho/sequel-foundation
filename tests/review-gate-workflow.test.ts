import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The review gate holds a token that can write commit statuses on a hub, on a
// `pull_request_target` run. These tests pin the shape that keeps that safe.
// The wrong versions: a checkout of the calling repository or of a pull
// request's head, an install step, an input that says which pull request to
// judge, a wider token, or a checkout that falls back to a branch.
const code = (path: string) => readFileSync(path, "utf8").replace(/^\s*#.*$/gm, "");

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

  // The wrong versions: a pin on a tag or a branch (either can be moved by
  // anyone with write access here, and the hub then runs other code with a
  // token that sets its review status), or a template that already names a
  // real commit a hub could copy without choosing a release.
  it("is pinned by commit id, and the template carries a placeholder that runs nothing", () => {
    const pins = [...src.matchAll(/\n    uses: (\S+)@(\S+)/g)];
    expect(pins).toHaveLength(1);
    expect(pins[0][1]).toBe("SequelOrtho/sequel-foundation/.github/workflows/review-gate.yml");
    expect(pins[0][2]).toBe("0".repeat(40));
    const docs = readFileSync("docs/REVIEW-GATE.md", "utf8");
    expect(docs).toMatch(/review-gate\.yml@<the release's 40-character commit id> # v\d+\.\d+\.\d+/);
    expect(docs).not.toMatch(/review-gate\.yml@v\d/);
    expect(docs).toContain("scripts/pin-review-gate.sh");
  });
});
