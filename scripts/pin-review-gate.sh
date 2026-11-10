#!/usr/bin/env bash
# Put the review gate's caller in a hub, or move its pin to a release.
#
#   scripts/pin-review-gate.sh <app-dir> <vX.Y.Z>
#
# Copies review-gate/caller.yml to <app-dir>/.github/workflows/review-gate.yml
# when the hub has none, then pins it to the COMMIT of the release (the tag
# stays in a comment). docs/REVIEW-GATE.md says why a commit and not the tag.
# scripts/pin-foundation.sh calls this for a hub that already has the caller.
set -euo pipefail

app="${1:?usage: pin-review-gate.sh <app-dir> <vX.Y.Z>}"
tag="${2:?usage: pin-review-gate.sh <app-dir> <vX.Y.Z>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
gate="$app/.github/workflows/review-gate.yml"

if ! node "$here/review-gate/pin.mjs" --carries "$tag"; then
  echo "review gate: $tag is not a release that has the gate — $gate is left as it is" >&2
  exit 1
fi

# The commit the tag names (an annotated tag's own id is not the commit: take
# the peeled line when there is one).
sha=$(git ls-remote --tags https://github.com/SequelOrtho/sequel-foundation "refs/tags/$tag^{}" "refs/tags/$tag" | awk '{print $1}' | tail -1)
[ -n "$sha" ] || { echo "review gate: tag $tag not found on SequelOrtho/sequel-foundation" >&2; exit 1; }

if [ ! -f "$gate" ]; then
  mkdir -p "$(dirname "$gate")"
  cp "$here/review-gate/caller.yml" "$gate"
  echo "copied the review gate caller to $gate"
fi
node "$here/review-gate/pin.mjs" "$gate" "$tag" "$sha"
