// A hub's review-gate caller (.github/workflows/review-gate.yml), written
// whole from review-gate/caller.yml with two things filled in: the default
// branch, and the pin — the release's full commit id, the tag in a comment.
//
//   uses: SequelOrtho/sequel-foundation/.github/workflows/review-gate.yml@<40 hex> # vX.Y.Z
//
// A commit id, not the tag: the called job holds a token that sets the hub's
// `independent-review` status, and a tag can be moved. And the file is written
// whole, never edited in place: a tool that rewrites one line of a file a
// person may have changed has to decide which line is the live one, and two
// review rounds each found a way for that to go wrong (independent review,
// 2026-11-10). The caller is not meant to be edited by hand, so the template
// plus these two values is all there is to keep.
//
// This file is a library with no command line of its own (review-gate/pin-cli.mjs
// is the command); everything here is pure and tested (tests/review-gate-pin.test.ts).

/** The first release whose commit carries the reusable workflow. */
export const FIRST_GATE_RELEASE = "v0.38.0";

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const SHA = /^[0-9a-f]{40}$/;
// A branch name this tool will write into YAML unquoted: plain names only.
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const order = (tag) => {
  const m = TAG.exec(tag);
  return m ? Number(m[1]) * 1e12 + Number(m[2]) * 1e6 + Number(m[3]) : NaN;
};

/** Whether the release named by `tag` carries the gate (an exact vX.Y.Z at or after the first one). */
export const carriesGate = (tag) => typeof tag === "string" && TAG.test(tag) && order(tag) >= order(FIRST_GATE_RELEASE);

// The two lines of the template that are filled in, exactly as it carries them.
const TEMPLATE_BRANCH = "    branches: [main]\n";
const TEMPLATE_PIN = `@${"0".repeat(40)} # set by scripts/pin-review-gate.sh\n`;
const once = (text, part) => text.split(part).length === 2;

/**
 * The caller for a hub: the template with its default branch and its pin set.
 * Throws when the release has no gate, the commit id is not a full one, the
 * branch is not a plain name, or the template is not the one this expects.
 */
export function renderCaller(template, { tag, sha, branch = "main" }) {
  if (!carriesGate(tag)) throw new Error(`${tag} has no review gate (the first release with it is ${FIRST_GATE_RELEASE})`);
  if (typeof sha !== "string" || !SHA.test(sha)) throw new Error(`the commit of ${tag} must be a full 40-character id, got '${sha}'`);
  if (typeof branch !== "string" || !BRANCH.test(branch)) throw new Error(`'${branch}' is not a branch name this tool will write`);
  if (typeof template !== "string" || !once(template, TEMPLATE_BRANCH) || !once(template, TEMPLATE_PIN)) throw new Error("review-gate/caller.yml is not the template this tool expects");
  return template.replace(TEMPLATE_BRANCH, `    branches: [${branch}]\n`).replace(TEMPLATE_PIN, `@${sha} # ${tag}\n`);
}

/**
 * The default branch an existing caller names, so a move keeps it — or null
 * when the file does not have exactly one such line the way this tool writes
 * it (then the branch has to be given).
 */
export function branchOf(existing) {
  const found = [...String(existing).matchAll(/^ {4}branches: \[([^\]\s,]+)\]\r?$/gm)].map((m) => m[1]);
  return found.length === 1 && BRANCH.test(found[0]) ? found[0] : null;
}
