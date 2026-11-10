#!/usr/bin/env bash
# Put the review gate's caller in a hub, or move it to a release.
#
#   scripts/pin-review-gate.sh <app-dir> <vX.Y.Z> [default-branch]
#
# Writes <app-dir>/.github/workflows/review-gate.yml whole, from this
# checkout's review-gate/caller.yml, pinned to the COMMIT of the release (the
# tag stays in a comment). docs/REVIEW-GATE.md says why a commit and not the
# tag. Run it from a checkout of that same release, so the caller written is
# the one that release was reviewed with; the script refuses otherwise.
# scripts/pin-foundation.sh calls this for a hub that already has the caller.
# The default branch is `main` for a new caller and is kept for an existing one.
set -euo pipefail

app="${1:?usage: pin-review-gate.sh <app-dir> <vX.Y.Z> [default-branch]}"
tag="${2:?usage: pin-review-gate.sh <app-dir> <vX.Y.Z> [default-branch]}"
branch="${3:-}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cli="$here/review-gate/pin-cli.mjs"

if ! node "$cli" --carries "$tag"; then
  echo "review gate: $tag is not a release that has the gate — nothing changed in $app" >&2
  exit 1
fi

have="v$(node -p 'require(process.argv[1]).version' "$here/package.json")"
if [ "$have" != "$tag" ]; then
  echo "review gate: this checkout is $have, not $tag — check out $tag here first, so the caller written is that release's. Nothing changed in $app" >&2
  exit 1
fi

# The commit the tag names. ls-remote matches by the END of a ref's name, so
# keep only the two exact names; an annotated tag's own id is not the commit,
# so the peeled line (^{}) wins when there is one.
sha=$(git ls-remote --tags https://github.com/SequelOrtho/sequel-foundation "refs/tags/$tag" "refs/tags/$tag^{}" \
  | awk -v t="refs/tags/$tag" '$2 == t { plain = $1 } $2 == t "^{}" { peeled = $1 } END { print (peeled != "" ? peeled : plain) }')
[ -n "$sha" ] || { echo "review gate: tag $tag not found on SequelOrtho/sequel-foundation — nothing changed in $app" >&2; exit 1; }

if [ -n "$branch" ]; then
  node "$cli" "$app" "$tag" "$sha" "$branch"
else
  node "$cli" "$app" "$tag" "$sha"
fi
