#!/usr/bin/env node
// The command the shell scripts run (scripts/pin-review-gate.sh,
// scripts/pin-foundation.sh). It always runs when started: there is no "was I
// run or imported" test to get wrong (an earlier one compared a real path with
// a symlinked one and, reached through a symlink, did nothing and exited 0).
//
//   pin-cli.mjs --carries <tag>                      exit 0 when the release has the gate, else 1
//   pin-cli.mjs <app-dir> <vX.Y.Z> <commit> [branch] write <app-dir>/.github/workflows/review-gate.yml
//
// Anything else is a usage error (exit 2). Every refusal exits non-zero and
// leaves the hub's file as it was.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { branchOf, carriesGate, renderCaller } from "./pin.mjs";

const args = process.argv.slice(2);
const fail = (code, message) => {
  console.error(`review gate: ${message}`);
  process.exit(code);
};

if (args[0] === "--carries") {
  if (args.length !== 2) fail(2, "usage: pin-cli.mjs --carries <vX.Y.Z>");
  process.exit(carriesGate(args[1]) ? 0 : 1);
}
if (args.length < 3 || args.length > 4 || args.some((a) => a.startsWith("--"))) fail(2, "usage: pin-cli.mjs <app-dir> <vX.Y.Z> <40-character commit id> [default-branch]");

const [app, tag, sha, givenBranch] = args;
const file = join(app, ".github/workflows/review-gate.yml");
try {
  const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "caller.yml"), "utf8");
  const had = existsSync(file);
  let branch = givenBranch;
  if (!branch && had) {
    branch = branchOf(readFileSync(file, "utf8"));
    if (!branch) throw new Error(`can't tell the default branch from ${file}; give it as the last argument`);
  }
  const text = renderCaller(template, { tag, sha, branch: branch ?? "main" });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`${had ? "rewrote" : "wrote"} ${file}: the review gate pinned to ${sha} (${tag}), pull requests into ${branch ?? "main"}`);
} catch (err) {
  fail(1, `${err.message} — ${file} is left as it was`);
}
