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
   For Maincloud, use host `https://maincloud.spacetimedb.com` (verified Fri 23:31).

## Maincloud (Fri 23:31)
Throwaway Maincloud DB `scamguard-test-311c81` (open writes; delete before the demo and before the
repo goes public). What ran: publish; `POST /v1/identity` on Maincloud for a token; HTTPS call to
`https://maincloud.spacetimedb.com/v1/database/<db>/call/report_verdict` returned 200 in 0.33s; two
Node TS SDK subscribers on `wss://maincloud.spacetimedb.com` filtered on `session_id = 'TEST23'`
both logged the insert at the same client receive time (06:31:07.080Z, each process's own clock).
Not re-run on Maincloud: the SQL row check and the other-session filter check (done locally).

Identity: each `POST /v1/identity` call mints a NEW identity, on any server. So mint the service
token on Maincloud, keep it in `.env`, and hardcode that token's hex in the identity check.
(Whether a local-server token works on Maincloud wasn't tested; don't rely on it.)

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
