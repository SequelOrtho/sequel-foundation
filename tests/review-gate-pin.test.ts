import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { branchOf, carriesGate, FIRST_GATE_RELEASE, renderCaller } from "../review-gate/pin.mjs";

// A hub's review-gate caller is written whole from the template, pinned to a
// release's commit (independent review of v0.38.0, 2026-11-10, three rounds).
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "89abcdef0123456789abcdef0123456789abcdef";
const USES = "    uses: SequelOrtho/sequel-foundation/.github/workflows/review-gate.yml@";
const template = readFileSync("review-gate/caller.yml", "utf8");
const version = `v${JSON.parse(readFileSync("package.json", "utf8")).version}`;
const live = (text: string) => text.split("\n").filter((l) => !/^\s*#/.test(l));

describe("which releases carry the gate", () => {
  // The wrong version: any vX.Y.Z is accepted, so rolling the package back to
  // v0.37.0 points the caller at a release with no workflow and the gate
  // stops setting a status without a word.
  it("is an exact release at or after the first one with the gate", () => {
    expect(FIRST_GATE_RELEASE).toBe("v0.38.0");
    for (const tag of ["v0.38.0", "v0.38.1", "v0.39.0", "v0.100.0", "v1.0.0", "v10.2.3"]) expect(carriesGate(tag), tag).toBe(true);
    for (const tag of ["v0.37.0", "v0.37.9", "v0.9.99", "v0.0.1", "main", "v0.38", "0.38.0", "v0.38.0-rc1", " v0.38.0", SHA, "", undefined, null, 38]) expect(carriesGate(tag as string), String(tag)).toBe(false);
  });
});

describe("the caller written for a hub", () => {
  it("is the template with the pin set to the release's commit and the tag in a comment", () => {
    const out = renderCaller(template, { tag: "v0.38.0", sha: SHA });
    expect(out).toContain(`${USES}${SHA} # v0.38.0\n`);
    expect(out.replace(`${SHA} # v0.38.0`, "X")).toBe(template.replace(/0{40} # set by scripts\/pin-review-gate\.sh/, "X"));
    // Exactly one live `uses:` line, and it is the commit: never a tag, a branch or the placeholder.
    const uses = live(out).filter((l) => /^\s*uses:/.test(l));
    expect(uses).toEqual([`${USES}${SHA} # v0.38.0`]);
  });

  it("names the hub's default branch when it is not main", () => {
    const out = renderCaller(template, { tag: "v0.38.0", sha: SHA, branch: "trunk" });
    expect(live(out).filter((l) => /branches:/.test(l))).toEqual(["    branches: [trunk]"]);
    expect(out.replace("[trunk]", "[main]")).toBe(renderCaller(template, { tag: "v0.38.0", sha: SHA }));
  });

  it("refuses a release with no gate, a commit id that is not a full one, an odd branch name, or a template it does not know", () => {
    expect(() => renderCaller(template, { tag: "v0.37.0", sha: SHA })).toThrow(/has no review gate/);
    expect(() => renderCaller(template, { tag: "main", sha: SHA })).toThrow(/has no review gate/);
    for (const sha of [SHA.slice(0, 7), SHA.toUpperCase(), "", "v0.38.0", "main", undefined]) expect(() => renderCaller(template, { tag: "v0.38.0", sha: sha as string })).toThrow(/full 40-character/);
    for (const branch of ["", "a b", "main]\n  pull_request:", "x,y", "-x", "*", "a".repeat(101)]) expect(() => renderCaller(template, { tag: "v0.38.0", sha: SHA, branch }), branch).toThrow(/not a branch name/);
    expect(() => renderCaller("name: Review gate\n", { tag: "v0.38.0", sha: SHA })).toThrow(/not the template/);
    expect(() => renderCaller(template + template, { tag: "v0.38.0", sha: SHA })).toThrow(/not the template/);
    // A caller that is already pinned is not a template: nothing is edited in place.
    expect(() => renderCaller(renderCaller(template, { tag: "v0.38.0", sha: SHA }), { tag: "v0.39.0", sha: OTHER })).toThrow(/not the template/);
  });

  it("reads the default branch back from a caller it wrote, and nothing from a file it can't be sure of", () => {
    expect(branchOf(renderCaller(template, { tag: "v0.38.0", sha: SHA }))).toBe("main");
    expect(branchOf(renderCaller(template, { tag: "v0.38.0", sha: SHA, branch: "release/2026" }))).toBe("release/2026");
    expect(branchOf(renderCaller(template, { tag: "v0.38.0", sha: SHA, branch: "trunk" }).replace(/\n/g, "\r\n"))).toBe("trunk");
    for (const text of ["", "name: x\n", "    # branches: [main]\n", "    branches: [main, dev]\n", "    branches: [main]\n    branches: [dev]\n", "  branches: [main]\n"]) expect(branchOf(text), text).toBeNull();
  });
});

// The command and the two scripts, run for real against a stand-in `git` that
// answers ls-remote the way GitHub does (no network).
describe("the command and the scripts", () => {
  const hub = () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-hub-"));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    // Answers for this checkout's own release only; also lists a look-alike
    // ref that ends the same way, which must not be taken.
    writeFileSync(
      join(bin, "git"),
      `#!/usr/bin/env bash\nfor a in "$@"; do if [ "$a" = "refs/tags/${version}" ]; then printf '%s\\trefs/tags/%s\\n' "${SHA}" "${version}"; printf '%s\\tzz/refs/tags/%s\\n' "${OTHER}" "${version}"; exit 0; fi; done\nexit 0\n`,
      { mode: 0o755 },
    );
    const app = join(dir, "app");
    mkdirSync(app);
    return { dir, app, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, file: join(app, ".github/workflows/review-gate.yml") };
  };
  const sh = (script: string, args: string[], env: NodeJS.ProcessEnv) => execFileSync("bash", [script, ...args], { env, stdio: "pipe" }).toString();
  const failing = (run: () => unknown) => {
    try {
      run();
    } catch (err) {
      const e = err as { status: number; stdout: Buffer; stderr: Buffer };
      return { status: e.status, out: `${e.stdout}${e.stderr}` };
    }
    throw new Error("expected the command to fail");
  };
  const cli = (args: string[], path = "review-gate/pin-cli.mjs") => execFileSync("node", [path, ...args], { stdio: "pipe" }).toString();

  it("--carries answers by exit code, and anything unknown is a usage error", () => {
    cli(["--carries", "v0.38.0"]);
    for (const tag of ["v0.37.0", "main", ""]) expect(failing(() => cli(["--carries", tag])).status, tag).toBe(1);
    for (const args of [[], ["--carries"], ["--carries", "v0.38.0", "x"], ["a", "v0.38.0"], ["--help"], ["a", "v0.38.0", SHA, "main", "extra"]]) expect(failing(() => cli(args)).status, args.join(" ")).toBe(2);
  });

  // The wrong version (round 2's blocker): the command decides whether it was
  // "run or imported" by comparing paths, so reached through a symlinked folder
  // it does nothing and exits 0 — a release with no gate "carries" it, and a
  // write reports success without writing.
  it("behaves the same when reached through a symlinked folder", () => {
    const { dir, app, file } = hub();
    const link = join(dir, "foundation-link");
    symlinkSync(resolve("."), link);
    const through = join(link, "review-gate/pin-cli.mjs");
    expect(failing(() => cli(["--carries", "v0.37.0"], through)).status).toBe(1);
    cli(["--carries", "v0.38.0"], through);
    expect(failing(() => cli([app, "v0.38.0", SHA.slice(0, 7)], through)).status).toBe(1);
    expect(existsSync(file)).toBe(false);
    cli([app, "v0.38.0", SHA], through);
    expect(readFileSync(file, "utf8")).toBe(renderCaller(template, { tag: "v0.38.0", sha: SHA }));
  });

  it("writes the file whole: a hand-edited caller comes back as the template's, keeping only its default branch", () => {
    const { app, file } = hub();
    cli([app, "v0.38.0", SHA, "trunk"]);
    // Someone edits it: the live pin goes to a branch, the old line stays as a comment.
    const edited = readFileSync(file, "utf8").replace(`${USES}${SHA} # v0.38.0`, `    # was: uses: SequelOrtho/sequel-foundation/.github/workflows/review-gate.yml@${SHA} # v0.38.0\n    uses: sequelortho/sequel-foundation/.github/workflows/review-gate.yml@main`);
    writeFileSync(file, edited);
    cli([app, "v0.39.0", OTHER]);
    expect(readFileSync(file, "utf8")).toBe(renderCaller(template, { tag: "v0.39.0", sha: OTHER, branch: "trunk" }));
    // A file whose default branch can't be read is left alone until the branch is given.
    writeFileSync(file, "name: something else\n");
    const refused = failing(() => cli([app, "v0.39.0", OTHER]));
    expect(refused.status).toBe(1);
    expect(refused.out).toMatch(/can't tell the default branch/);
    expect(readFileSync(file, "utf8")).toBe("name: something else\n");
    cli([app, "v0.39.0", OTHER, "main"]);
    expect(readFileSync(file, "utf8")).toBe(renderCaller(template, { tag: "v0.39.0", sha: OTHER }));
  });

  it("pin-review-gate.sh installs the caller pinned to the release's commit, taking the exact tag's line", () => {
    const { app, env, file } = hub();
    const out = sh("scripts/pin-review-gate.sh", [app, version], env);
    expect(out).toMatch(/wrote .*review-gate\.yml: the review gate pinned to/);
    expect(readFileSync(file, "utf8")).toBe(renderCaller(template, { tag: version, sha: SHA }));
    sh("scripts/pin-review-gate.sh", [app, version, "trunk"], env);
    expect(readFileSync(file, "utf8")).toBe(renderCaller(template, { tag: version, sha: SHA, branch: "trunk" }));
  });

  it("pin-review-gate.sh refuses, leaving the hub as it was: a release with no gate, one this checkout is not on, a missing tag, a commit", () => {
    const { app, env, file } = hub();
    sh("scripts/pin-review-gate.sh", [app, version], env);
    const before = readFileSync(file, "utf8");
    for (const [ref, why] of [["v0.37.0", /not a release that has the gate/], ["v99.0.0", /this checkout is/], ["main", /not a release that has the gate/], [SHA, /not a release that has the gate/]] as const) {
      const r = failing(() => sh("scripts/pin-review-gate.sh", [app, ref], env));
      expect(r.status, ref).toBe(1);
      expect(r.out, ref).toMatch(why);
      expect(readFileSync(file, "utf8")).toBe(before);
    }
    // A tag GitHub does not have: a stand-in git that answers nothing.
    const silent = join(app, "..", "silent");
    mkdirSync(silent);
    writeFileSync(join(silent, "git"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    const none = failing(() => sh("scripts/pin-review-gate.sh", [app, version], { ...env, PATH: `${silent}:${process.env.PATH}` }));
    expect(none.status).toBe(1);
    expect(none.out).toMatch(/not found on SequelOrtho\/sequel-foundation/);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  // pin-foundation.sh: the caller moves before the package is touched. This
  // stand-in hub does not depend on the package, so the package step stops
  // the script after the caller step has run and said what it did.
  it("pin-foundation.sh moves an existing caller first, leaves it for a release without the gate, and says when there is none", () => {
    const { app, env, file } = hub();
    const pkg = '{"name":"hub","dependencies":{}}\n';
    writeFileSync(join(app, "package.json"), pkg);
    expect(failing(() => sh("scripts/pin-foundation.sh", [app, version], env)).out).toMatch(/note: this app has no review gate caller/);
    expect(existsSync(file)).toBe(false);
    sh("scripts/pin-review-gate.sh", [app, version, "trunk"], env);
    writeFileSync(file, readFileSync(file, "utf8").replace(SHA, OTHER)); // as if pinned to an earlier release's commit
    expect(failing(() => sh("scripts/pin-foundation.sh", [app, "v0.37.0"], env)).out).toMatch(/keeps its pin — v0\.37\.0 is not a release that has the review gate/);
    expect(readFileSync(file, "utf8")).toContain(OTHER);
    expect(failing(() => sh("scripts/pin-foundation.sh", [app, version], env)).out).toMatch(/rewrote .*review-gate\.yml: the review gate pinned to/);
    expect(readFileSync(file, "utf8")).toBe(renderCaller(template, { tag: version, sha: SHA, branch: "trunk" }));
    expect(readFileSync(join(app, "package.json"), "utf8")).toBe(pkg);
    const src = readFileSync("scripts/pin-foundation.sh", "utf8");
    expect(src.indexOf('"$here/pin-review-gate.sh" . "$ref"')).toBeLessThan(src.indexOf('fs.writeFileSync("package.json"'));
  });
});
