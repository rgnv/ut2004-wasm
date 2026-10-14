#!/usr/bin/env bash
# Provision the exact source trees this port builds against:
#   1. the pinned community UT2004_CMAKE tree + this repo's patch series, and
#   2. GL4ES at the pinned commit.
#
# The engine source tree is NOT distributed with this repository — this script
# fetches it from its public home and applies ./patches on top. See NOTICE.md.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
UPSTREAM=${UT2004_UPSTREAM:-https://github.com/emmanuelgoldstein1337/UT2004_CMAKE.git}
BASE=deda0fb464371b661b616b4e58ff4d53f6f011f1
GL4ES_URL=${GL4ES_UPSTREAM:-https://github.com/ptitSeb/gl4es.git}
GL4ES_COMMIT=ec16bedd8819c475326f4f1a3063772c6d986e06

mkdir -p "$ROOT/src"

if [ ! -d "$ROOT/src/UT2004_CMAKE/.git" ]; then
  echo "==> cloning engine source tree (community UT2004_CMAKE, not distributed here)"
  git clone "$UPSTREAM" "$ROOT/src/UT2004_CMAKE"
fi

echo "==> checking out base commit $BASE"
git -C "$ROOT/src/UT2004_CMAKE" fetch origin
git -C "$ROOT/src/UT2004_CMAKE" checkout -B wasm-port "$BASE"

# git am needs a committer identity; use the local one or a placeholder.
if ! git -C "$ROOT/src/UT2004_CMAKE" config user.email >/dev/null 2>&1; then
  git -C "$ROOT/src/UT2004_CMAKE" config user.name "ut2004-wasm bootstrap"
  git -C "$ROOT/src/UT2004_CMAKE" config user.email "ut2004-wasm@localhost"
fi

echo "==> applying port patch series"
if [ -n "$(git -C "$ROOT/src/UT2004_CMAKE" rev-list --count "$BASE"..wasm-port 2>/dev/null || echo 0)" ] \
   && [ "$(git -C "$ROOT/src/UT2004_CMAKE" rev-list --count "$BASE"..wasm-port 2>/dev/null || echo 0)" != "0" ]; then
  echo "    patches already applied; skipping"
else
  git -C "$ROOT/src/UT2004_CMAKE" am --3way "$ROOT"/patches/*.patch
fi

echo "==> port branch:"
git -C "$ROOT/src/UT2004_CMAKE" log --oneline -1

if [ ! -d "$ROOT/src/gl4es/.git" ]; then
  echo "==> cloning GL4ES"
  git clone "$GL4ES_URL" "$ROOT/src/gl4es"
fi
echo "==> checking out GL4ES $GL4ES_COMMIT"
git -C "$ROOT/src/gl4es" fetch origin
git -C "$ROOT/src/gl4es" checkout "$GL4ES_COMMIT"

echo
echo "sources ready:"
echo "  $ROOT/src/UT2004_CMAKE  (branch wasm-port, $(git -C "$ROOT/src/UT2004_CMAKE" rev-list --count "$BASE"..wasm-port) port commits applied)"
echo "  $ROOT/src/gl4es         (pinned $GL4ES_COMMIT)"
echo
echo "next:"
echo "  ./link-web.sh    # browser client  -> build/web/"
echo "  ./link-em.sh     # node harness    -> build/ut2004.js"
