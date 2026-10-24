#!/usr/bin/env bash
# End-to-end smoke test of the verdict path, LOCAL server only:
#   build -> publish to a throwaway DB -> report_verdict over HTTP (like Sophia's
#   pipeline) -> two live subscribers (elder + family) -> session filtering.
# Never touches Maincloud or the dev DB. Prints PASS/FAIL per check; exits 1 on any FAIL.
# Usage: scripts/smoke-test.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPACETIME="${SPACETIME:-$(command -v spacetime || echo "$HOME/.local/bin/spacetime")}"
HOST_HTTP="http://127.0.0.1:3000"
# Publish/delete by URL, not the "local" nickname, so every step hits the same server.
SERVER="$HOST_HTTP"
HOST_WS="ws://127.0.0.1:3000"
DB="smoke-$(openssl rand -hex 3)"
WORK="$(mktemp -d)"
FAILS=0
STARTED_SERVER=""

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }

cleanup() {
  "$SPACETIME" delete --server "$SERVER" -y "$DB" >/dev/null 2>&1
  if [ -n "$STARTED_SERVER" ]; then kill "$STARTED_SERVER" 2>/dev/null; wait "$STARTED_SERVER" 2>/dev/null; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

cd "$ROOT" || exit 1

# 1. Client builds (run tools directly: npm scripts break on this machine, see HACK.md)
if node node_modules/typescript/bin/tsc -b >"$WORK/tsc.log" 2>&1; then
  pass "client typechecks"
else
  fail "client typechecks"; sed 's/^/      /' "$WORK/tsc.log" | head -20
fi

# 2. Generated bindings match the module
if "$SPACETIME" generate --lang typescript --out-dir "$WORK/bindings" --module-path spacetimedb >/dev/null 2>&1 \
  && diff -rq "$WORK/bindings" src/module_bindings >/dev/null; then
  pass "module_bindings up to date"
else
  fail "module_bindings up to date (run: spacetime generate --lang typescript --out-dir src/module_bindings --module-path spacetimedb)"
fi

# 3. Local server up (start one if needed, stop it afterwards)
if ! curl -sf -o /dev/null "$HOST_HTTP/v1/ping"; then
  "$SPACETIME" start --listen-addr 127.0.0.1:3000 >"$WORK/server.log" 2>&1 &
  STARTED_SERVER=$!
  for _ in $(seq 1 20); do curl -sf -o /dev/null "$HOST_HTTP/v1/ping" && break; sleep 0.5; done
fi
if curl -sf -o /dev/null "$HOST_HTTP/v1/ping"; then pass "local server reachable"; else fail "local server reachable"; exit 1; fi

# 4. Publish module to a throwaway DB
if "$SPACETIME" publish --server "$SERVER" --module-path spacetimedb -y "$DB" >"$WORK/publish.log" 2>&1; then
  pass "module publishes ($DB)"
else
  fail "module publishes"; tail -5 "$WORK/publish.log" | sed 's/^/      /'; exit 1
fi

# 5. Two subscribers on session SMOKE2 (elder + family stand-ins)
node node_modules/esbuild/bin/esbuild scripts/smoke/subscriber.ts --bundle --platform=node \
  --format=esm --outfile="$WORK/subscriber.mjs" --log-level=error || { fail "bundle subscriber"; exit 1; }
node "$WORK/subscriber.mjs" "$HOST_WS" "$DB" SMOKE2 elder 8 >"$WORK/elder.log" 2>&1 &
ELDER=$!
node "$WORK/subscriber.mjs" "$HOST_WS" "$DB" SMOKE2 family 8 >"$WORK/family.log" 2>&1 &
FAMILY=$!
for _ in $(seq 1 20); do
  grep -q subscribed "$WORK/elder.log" 2>/dev/null && grep -q subscribed "$WORK/family.log" 2>/dev/null && break
  sleep 0.25
done

# 6. Pipeline-style HTTP calls: one for SMOKE2, one for another session
TOKEN=$(curl -sf -X POST "$HOST_HTTP/v1/identity" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])' 2>/dev/null)
[ -n "$TOKEN" ] && pass "mint identity token" || fail "mint identity token"
call() {
  curl -s -o /dev/null -w '%{http_code}' -X POST "$HOST_HTTP/v1/database/$DB/call/report_verdict" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$1"
}
CODE=$(call '["SMOKE2","Smoke App","high",["reason one","reason two"],"Smoke test warning.","烟雾测试警告。"]')
[ "$CODE" = 200 ] && pass "report_verdict over HTTP (200)" || fail "report_verdict over HTTP (got $CODE)"
call '["OTHER3","Other App","low",[],"Other session.","其他会话。"]' >/dev/null
# Only the subscribers: a bare `wait` would also wait on a server we started.
wait "$ELDER" "$FAMILY"

# 7. Both subscribers got the SMOKE2 verdict live, intact, and nothing from OTHER3
for who in elder family; do
  LOG="$WORK/$who.log"
  if grep -q '"live":true,"session":"SMOKE2"' "$LOG" && grep -q '烟雾测试警告' "$LOG" && grep -q 'reason two' "$LOG"; then
    pass "$who subscriber got verdict live (Chinese + reasons intact)"
  else
    fail "$who subscriber got verdict live"; sed 's/^/      /' "$LOG" | head -5
  fi
  if grep -q OTHER3 "$LOG"; then fail "$who subscriber filtered out other session"; else pass "$who subscriber filtered out other session"; fi
done

# 8. Info only: does report_verdict reject anonymous callers yet? (identity check, PENDING)
ANON=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$HOST_HTTP/v1/database/$DB/call/report_verdict" \
  -H 'Content-Type: application/json' -d '["ANON9","Anon","low",[],"anon","匿名"]')
if [ "$ANON" = 200 ]; then
  echo "INFO  anonymous report_verdict ACCEPTED (identity check not in place yet)"
else
  echo "INFO  anonymous report_verdict rejected (HTTP $ANON)"
fi

echo
if [ "$FAILS" -eq 0 ]; then echo "SMOKE TEST: PASS"; else echo "SMOKE TEST: FAIL ($FAILS)"; exit 1; fi
