#!/usr/bin/env bash
# End-to-end smoke test of the verdict path, LOCAL server only:
#   build -> publish to a throwaway DB -> lock report_verdict to a service identity ->
#   report_verdict over HTTP (like Sophia's pipeline) -> two live subscribers
#   (elder + family) -> session filtering; impostors and anonymous callers rejected.
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
  "$SPACETIME" delete --no-config --server "$SERVER" -y "$DB" >/dev/null 2>&1
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
if "$SPACETIME" publish --no-config --server "$SERVER" --module-path spacetimedb -y "$DB" >"$WORK/publish.log" 2>&1; then
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

# 6. Identity lock + pipeline-style HTTP calls (like Sophia's service)
MINT=$(curl -sf -X POST "$HOST_HTTP/v1/identity")
TOKEN=$(echo "$MINT" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])' 2>/dev/null)
SVC_HEX=$(echo "$MINT" | python3 -c 'import json,sys;print(json.load(sys.stdin)["identity"])' 2>/dev/null)
[ -n "$TOKEN" ] && [ -n "$SVC_HEX" ] && pass "mint service identity token" || fail "mint service identity token"
rejected() { [ -n "$1" ] && [ "$1" != 200 ] && [ "$1" != 000 ]; }
call() { # call <reducer> <json-args> [token]
  local auth=(); [ -n "${3:-}" ] && auth=(-H "Authorization: Bearer $3")
  curl -s -o /dev/null -w '%{http_code}' -X POST "$HOST_HTTP/v1/database/$DB/call/$1" \
    ${auth[@]+"${auth[@]}"} -H 'Content-Type: application/json' -d "$2"
}
VERDICT='["SMOKE2","Smoke App","high",["reason one","reason two"],"Smoke test warning.","烟雾测试警告。"]'
CODE=$(call report_verdict "$VERDICT" "$TOKEN")
rejected "$CODE" && pass "report_verdict rejected before service is set ($CODE)" || fail "report_verdict rejected before service is set"
CODE=$(call set_service_identity "[\"$SVC_HEX\"]" "$TOKEN")
rejected "$CODE" && pass "non-owner can't set service identity ($CODE)" || fail "non-owner can't set service identity"
if "$SPACETIME" call --no-config --server "$SERVER" -y "$DB" set_service_identity "$SVC_HEX" >"$WORK/setsvc.log" 2>&1; then
  pass "owner sets service identity (spacetime call)"
else
  fail "owner sets service identity"; sed 's/^/      /' "$WORK/setsvc.log" | head -5
fi
CODE=$(call report_verdict "$VERDICT" "$TOKEN")
[ "$CODE" = 200 ] && pass "service report_verdict over HTTP (200)" || fail "service report_verdict over HTTP (got $CODE)"
call report_verdict '["OTHER3","Other App","low",[],"Other session.","其他会话。"]' "$TOKEN" >/dev/null
CODE=$(call report_verdict '["SMOKE2","Fake","high",[],"anon","匿名"]')
rejected "$CODE" && pass "anonymous report_verdict rejected ($CODE)" || fail "anonymous report_verdict rejected"
OTHER_TOKEN=$(curl -sf -X POST "$HOST_HTTP/v1/identity" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])' 2>/dev/null)
CODE=$(call report_verdict '["SMOKE2","Fake","high",[],"impostor","冒充"]' "$OTHER_TOKEN")
rejected "$CODE" && pass "other identity's report_verdict rejected ($CODE)" || fail "other identity's report_verdict rejected"
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
  if grep -q '"app":"Fake"' "$LOG"; then fail "$who subscriber got a rejected fake verdict"; else pass "$who subscriber saw no fake verdicts"; fi
done

echo
if [ "$FAILS" -eq 0 ]; then echo "SMOKE TEST: PASS"; else echo "SMOKE TEST: FAIL ($FAILS)"; exit 1; fi
