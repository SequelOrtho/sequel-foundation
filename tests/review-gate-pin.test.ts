import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { carriesGate, FIRST_GATE_RELEASE, pinCaller } from "../review-gate/pin.mjs";

// The pin in a hub's review-gate caller (independent review, 2026-11-10).
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "89abcdef0123456789abcdef0123456789abcdef";
const LINE = "    uses: SequelOrtho/sequel-foundation/.github/workflows/review-gate.yml@";
const template = readFileSync("review-gate/caller.yml", "utf8");
const pinOf = (text: string) => text.match(/review-gate\.yml@(\S+)(?:[ \t]*#[ \t]*([^\r\n]*))?/)!;

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

describe("pinning the caller", () => {
  it("replaces the template's placeholder with the release's commit, the tag in a comment", () => {
    const out = pinCaller(template, "v0.38.0", SHA);
    expect(out).toContain(`${LINE}${SHA} # v0.38.0\n`);
    expect(out.replace(`${SHA} # v0.38.0`, "X")).toBe(template.replace(/0{40} # set by scripts\/pin-review-gate\.sh/, "X"));
  });

  // The wrong version: a caller already pinned to a commit is rewritten to a
  // movable tag on the next bump.
  it("moves a commit pin to the new release's commit, never to a tag", () => {
    const pinned = pinCaller(template, "v0.38.0", SHA);
    const moved = pinCaller(pinned, "v0.39.0", OTHER);
    expect(pinOf(moved).slice(1, 3)).toEqual([OTHER, "v0.39.0"]);
    expect(moved).not.toContain(SHA);
    expect(moved).not.toMatch(/review-gate\.yml@v\d/);
    // An older tag pin (or a branch) is replaced by a commit too.
    for (const ref of ["v0.38.0", "main"]) expect(pinOf(pinCaller(`${LINE}${ref}\n`, "v0.38.1", OTHER)).slice(1, 3)).toEqual([OTHER, "v0.38.1"]);
  });

  // The wrong version: the result is checked for a literal "\n" after the
  // pin, so a file with CRLF endings, no final newline or a comment after the
  // pin is refused after the package has already been re-pinned.
  it("keeps line endings, a missing final newline and the rest of the file", () => {
    expect(pinCaller(`a: 1\r\n${LINE}v0.38.0\r\nb: 2\r\n`, "v0.38.1", SHA)).toBe(`a: 1\r\n${LINE}${SHA} # v0.38.1\r\nb: 2\r\n`);
    expect(pinCaller(`${LINE}${OTHER} # v0.38.0`, "v0.38.1", SHA)).toBe(`${LINE}${SHA} # v0.38.1`);
    expect(pinCaller(`${LINE}v0.38.0   # pinned by hand\n`, "v0.38.1", SHA)).toBe(`${LINE}${SHA} # v0.38.1\n`);
  });

  it("refuses, changing nothing, a release with no gate, a short commit id, or a file without exactly one pin", () => {
    expect(() => pinCaller(template, "v0.37.0", SHA)).toThrow(/has no review gate/);
    expect(() => pinCaller(template, "main", SHA)).toThrow(/has no review gate/);
    for (const sha of [SHA.slice(0, 7), SHA.toUpperCase(), "", undefined]) expect(() => pinCaller(template, "v0.38.0", sha as string)).toThrow(/full 40-character/);
    expect(() => pinCaller("name: Review gate\n", "v0.38.0", SHA)).toThrow(/found 0/);
    expect(() => pinCaller(`${LINE}v0.38.0\n${LINE}v0.38.0\n`, "v0.38.0", SHA)).toThrow(/found 2/);
  });

  it("as a command, --carries answers by exit code", () => {
    execFileSync("node", ["review-gate/pin.mjs", "--carries", "v0.38.0"]);
    for (const tag of ["v0.37.0", "main", ""]) expect(() => execFileSync("node", ["review-gate/pin.mjs", "--carries", tag], { stdio: "pipe" }), tag).toThrow();
  });

  // The command the shell scripts run: a refusal exits 1 and leaves the file.
  it("as a command, writes the file or exits 1 leaving it untouched", () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-pin-"));
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    const file = join(dir, ".github/workflows/review-gate.yml");
    writeFileSync(file, template);
    execFileSync("node", ["review-gate/pin.mjs", file, "v0.38.0", SHA]);
    expect(readFileSync(file, "utf8")).toContain(`${SHA} # v0.38.0`);
    const before = readFileSync(file, "utf8");
    expect(() => execFileSync("node", ["review-gate/pin.mjs", file, "v0.37.0", OTHER], { stdio: "pipe" })).toThrow();
    expect(readFileSync(file, "utf8")).toBe(before);
  });
});

// The scripts themselves, with a stand-in `git` that answers ls-remote the way
// GitHub does for a release (no network). The wrong version (caught by the
// first review of this fix): the scripts ask "does this release carry the
// gate" in a way that always answers no, so no hub can ever be pinned.
describe("scripts/pin-review-gate.sh", () => {
  const hub = () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-hub-"));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "git"), `#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in refs/tags/v0.38.0|refs/tags/v0.39.0) printf '%s\\trefs/tags/%s\\n' "${SHA}" "\${a#refs/tags/}"; exit 0;; esac; done\nexit 0\n`, { mode: 0o755 });
    const app = join(dir, "app");
    mkdirSync(app);
    return { app, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, file: join(app, ".github/workflows/review-gate.yml") };
  };
  const run = (script: string, app: string, ref: string, env: NodeJS.ProcessEnv) => execFileSync("bash", [script, app, ref], { env, stdio: "pipe" }).toString();

  it("installs the caller in a hub that has none, pinned to the release's commit", () => {
    const { app, env, file } = hub();
    const out = run("scripts/pin-review-gate.sh", app, "v0.38.0", env);
    expect(out).toMatch(/copied the review gate caller/);
    expect(readFileSync(file, "utf8")).toBe(pinCaller(template, "v0.38.0", SHA));
    // Again, for a later release: the pin moves, nothing else does.
    run("scripts/pin-review-gate.sh", app, "v0.39.0", env);
    expect(readFileSync(file, "utf8")).toBe(pinCaller(template, "v0.39.0", SHA));
  });

  it("refuses a release with no gate, a tag that does not exist, and anything that is not a release, leaving the hub as it was", () => {
    const { app, env, file } = hub();
    run("scripts/pin-review-gate.sh", app, "v0.38.0", env);
    const before = readFileSync(file, "utf8");
    for (const ref of ["v0.37.0", "v0.40.0", "main", SHA]) {
      expect(() => run("scripts/pin-review-gate.sh", app, ref, env), ref).toThrow();
      expect(readFileSync(file, "utf8")).toBe(before);
    }
  });

  // pin-foundation.sh: the caller moves before the package is touched (here
  // the package step then stops, because this stand-in hub has no dependency
  // on the package — the caller has already moved, package.json has not).
  it("pin-foundation.sh moves an existing caller for a release with the gate and leaves it for an older one", () => {
    const { app, env, file } = hub();
    writeFileSync(join(app, "package.json"), '{"name":"hub","dependencies":{}}\n');
    run("scripts/pin-review-gate.sh", app, "v0.38.0", env);
    const at38 = readFileSync(file, "utf8");
    let out = "";
    try { run("scripts/pin-foundation.sh", app, "v0.37.0", env); } catch (err) { out = String((err as { stdout: Buffer }).stdout) + String((err as { stderr: Buffer }).stderr); }
    expect(out).toMatch(/keeps its pin — v0\.37\.0 is not a release that has the review gate/);
    expect(readFileSync(file, "utf8")).toBe(at38);
    try { run("scripts/pin-foundation.sh", app, "v0.39.0", env); } catch (err) { out = String((err as { stdout: Buffer }).stdout); }
    expect(out).toMatch(/pinned the review gate caller → [0-9a-f]{40} \(v0\.39\.0\)/);
    expect(readFileSync(file, "utf8")).toBe(pinCaller(template, "v0.39.0", SHA));
    expect(readFileSync(join(app, "package.json"), "utf8")).toBe('{"name":"hub","dependencies":{}}\n');
  });
});

// pin-foundation.sh moves the caller before it touches the package, only for
// a release that has the gate. (Its network steps are not run here.)
describe("scripts/pin-foundation.sh and the caller", () => {
  const src = readFileSync("scripts/pin-foundation.sh", "utf8");
  it("moves the caller first, through pin-review-gate.sh, and only for a release with the gate", () => {
    const gate = src.indexOf('"$here/pin-review-gate.sh" . "$ref"');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(src.indexOf("fs.writeFileSync(\"package.json\""));
    expect(gate).toBeLessThan(src.indexOf('npm install "@sequel/foundation@$spec"'));
    expect(src).toMatch(/pin\.mjs" --carries "\$ref"/);
    expect(src).toMatch(/note: \$gate keeps its pin/);
    expect(src).not.toMatch(/review-gate\\?\.yml@\)\[\^/); // no second copy of the rewrite
  });
});
