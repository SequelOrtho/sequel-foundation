#!/usr/bin/env bash
# Pin a fleet app to a foundation release and re-resolve the lockfile.
#
#   scripts/pin-foundation.sh <app-dir> <vX.Y.Z | 40-char-sha>
#
# Why a script: `npm install` after editing the spec string by hand reports
# "up to date" and silently KEEPS the previously resolved SHA for a git
# dependency. Only the explicit `npm install <name>@<spec>` form re-resolves.
# This script edits package.json, runs that form, and fails loudly unless the
# lockfile's resolved SHA actually matches the requested ref.
set -euo pipefail

app="${1:?usage: pin-foundation.sh <app-dir> <vX.Y.Z|sha>}"
ref="${2:?usage: pin-foundation.sh <app-dir> <vX.Y.Z|sha>}"
spec="github:SequelOrtho/sequel-foundation#$ref"

cd "$app"
[ -f package.json ] || { echo "no package.json in $app" >&2; exit 1; }

# Resolve the ref to the commit the lockfile must end up on.
if [[ "$ref" =~ ^[0-9a-f]{40}$ ]]; then
  want="$ref"
else
  want=$(git ls-remote --tags https://github.com/SequelOrtho/sequel-foundation "refs/tags/$ref^{}" "refs/tags/$ref" | awk '{print $1}' | tail -1)
  [ -n "$want" ] || { echo "tag $ref not found on SequelOrtho/sequel-foundation" >&2; exit 1; }
fi

node -e '
  const fs = require("fs");
  const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const bucket = ["dependencies","devDependencies"].find(k => p[k] && p[k]["@sequel/foundation"]);
  if (!bucket) { console.error("@sequel/foundation is not a dependency here"); process.exit(1); }
  p[bucket]["@sequel/foundation"] = process.argv[1];
  fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
' "$spec"

npm install "@sequel/foundation@$spec" --no-audit --no-fund

got=$(node -p "
  const l = require('./package-lock.json');
  const e = l.packages && l.packages['node_modules/@sequel/foundation'];
  (e && e.resolved || '').split('#')[1] || ''
")
if [ "$got" != "$want" ]; then
  echo "lockfile resolved to '$got' but $ref is $want — re-resolution failed" >&2
  exit 1
fi
echo "pinned @sequel/foundation → $spec (resolved $got)"
