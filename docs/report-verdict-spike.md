# report_verdict spike (Fri 22:15, Anthony)

Result: **works over plain HTTP. No SDK needed on the pipeline side.** Tested against a local
SpacetimeDB 2.13 server with the `verdict` table in `spacetimedb/src/index.ts`. Re-tested after
the contract was agreed (Fri 22:45, `created_at` renamed to `timestamp`).

## For Sophia: calling it from the pipeline

1. Get a service identity once and keep the token in your `.env`. Never commit it.
   ```
   curl -s -X POST http://127.0.0.1:3000/v1/identity
   # -> {"identity":"c200...","token":"eyJ..."}
   ```
   The `identity` hex is what the reducer's identity check (still TODO, PENDING) will compare against.
   Each server issues its own identities, so re-run this against the Maincloud host for the demo.
   The hex may differ there, and the module's hardcoded hex must match the deploy target (to be
   confirmed in the hosting check).
2. Call the reducer. The body is a JSON array of args **in this order**: session_id, app_name,
   risk_level, reasons, explanation_en, explanation_zh. Don't send timestamp; the reducer sets it.
   This matches the field order in the agreed verdict contract in HACK.md.
   ```
   curl -X POST http://127.0.0.1:3000/v1/database/scamguard-7xwfd/call/report_verdict \
     -H "Authorization: Bearer $SPACETIME_TOKEN" -H 'Content-Type: application/json' \
     -d '["TEST01","FakeCoin Pro","high",["requests SMS read permission"],"Warning: ...","警告：……"]'
   # -> HTTP 200, empty body
   ```
   Python (UNTESTED, hand-written equivalent of the curl above):
   `requests.post(url, json=[...], headers={"Authorization": f"Bearer {token}"})`.
   For Maincloud, swap the host for the Maincloud URL (to be confirmed in the hosting check).

## What was checked
- HTTP 200, and the row lands with the Chinese text and the `reasons` array intact (`spacetime sql`).
- Two TS SDK subscribers (stand-ins for the elder and family screens) filtered on
  `session_id = 'TEST01'` both got the insert live, at the same timestamp, with no polling.
- A verdict for a different session (`OTHER9`) reached neither subscriber.

## Gotchas
- When a client subscribes, existing rows also fire `onInsert`. The UI should treat those as
  history, not as a new alert.
- The reducer currently accepts any caller (identity check TODO). Tested: a call with NO
  Authorization header also inserted a row. Keep it on local or a throwaway Maincloud DB until the
  check lands.

## Reproduce
```
spacetime start --listen-addr 127.0.0.1:3000
spacetime publish --server local --module-path spacetimedb -y scamguard-7xwfd
```
