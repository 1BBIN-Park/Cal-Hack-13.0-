#!/usr/bin/env bash
# Runs the link-extraction regression cases in scripts/tests/links.test.ts.
# Strings only: no URL in the tests is fetched or opened.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
cd "$ROOT"
# esbuild comes in via vite (not a direct dependency); fine for a hackathon.
node node_modules/esbuild/bin/esbuild scripts/tests/links.test.ts --bundle --platform=node \
  --outfile="$OUT/links.test.cjs" --log-level=error
node "$OUT/links.test.cjs"
