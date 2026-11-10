#!/usr/bin/env node
// Writes the pin in a hub's review-gate caller (.github/workflows/review-gate.yml):
// the release's full commit id, with the release's tag in a trailing comment.
//
//   uses: SequelOrtho/sequel-foundation/.github/workflows/review-gate.yml@<40 hex> # vX.Y.Z
//
// A commit id, not the tag: a tag can be moved or re-created by anyone with
// write access to this repository, and the hub would then run other code with
// a token that can set its `independent-review` status. A commit id only
// changes through a pull request in the hub (independent review, 2026-11-10).
//
// Run by scripts/pin-review-gate.sh, which resolves the tag to its commit.
// `pinCaller` is pure and tested (tests/review-gate-pin.test.ts).

/** The first release whose commit carries the reusable workflow. */
export const FIRST_GATE_RELEASE = "v0.38.0";

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const SHA = /^[0-9a-f]{40}$/;
const order = (tag) => {
  const m = TAG.exec(tag);
  return m ? Number(m[1]) * 1e12 + Number(m[2]) * 1e6 + Number(m[3]) : NaN;
};

/** Whether the release named by `tag` carries the gate (an exact vX.Y.Z at or after the first one). */
export const carriesGate = (tag) => typeof tag === "string" && TAG.test(tag) && order(tag) >= order(FIRST_GATE_RELEASE);

// The pin, up to the end of its line: whatever ref is there now (a commit id,
// a tag, the template's placeholder) and any comment after it.
const PIN = /(uses:[ \t]*SequelOrtho\/sequel-foundation\/\.github\/workflows\/review-gate\.yml@)[^\s#]*(?:[ \t]*#[^\r\n]*)?/g;

/**
 * The caller's text with its pin set to `sha # tag`. Throws, changing nothing,
 * when the release has no gate, the commit id is not a full one, or the text
 * has no pin (or more than one) to set. Line endings and a missing final
 * newline are kept as they are.
 */
export function pinCaller(text, tag, sha) {
  if (!carriesGate(tag)) throw new Error(`${tag} has no review gate (the first release with it is ${FIRST_GATE_RELEASE}); the caller's pin is left as it is`);
  if (typeof sha !== "string" || !SHA.test(sha)) throw new Error(`the commit of ${tag} must be a full 40-character id, got '${sha}'`);
  const found = [...String(text).matchAll(PIN)];
  if (found.length !== 1) throw new Error(`expected one review-gate pin in the caller, found ${found.length}`);
  return String(text).replace(PIN, (_, head) => `${head}${sha} # ${tag}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const [file, tag, sha] = process.argv.slice(2);
  try {
    writeFileSync(file, pinCaller(readFileSync(file, "utf8"), tag, sha));
    console.log(`pinned the review gate caller → ${sha} (${tag})`);
  } catch (err) {
    console.error(`review gate: ${err.message}`);
    process.exit(1);
  }
}
