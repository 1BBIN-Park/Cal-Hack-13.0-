# report_verdict spike (Fri 22:15, Anthony)

Result: **works over plain HTTP. No SDK needed on the pipeline side.** Tested against a local
SpacetimeDB 2.13 server with the `verdict` table in `spacetimedb/src/index.ts`. Re-tested after
the contract was agreed (Fri 22:45, `created_at` renamed to `timestamp`).

## For Sophia: calling it from the pipeline

1. Get a service identity once and keep the token in your `.env`. Never commit it.
   ```
   curl -s -X POST http://127.0.0.1:3000/v1/identity
   # -> {"identity":"<hex>","token":"<token>"}
   ```
   Send Anthony ONLY the `identity` hex; he authorizes it on the DB (see "Identity lock" below).
   Mint it against the deploy target (Maincloud for the demo). Each call mints a NEW identity.
2. Call the reducer. The body is a JSON array of args **in this order**: session_id, app_name,
   risk_level, reasons, explanation_en, explanation_zh. Don't send timestamp; the reducer sets it.
   This matches the field order in the agreed verdict contract in HACK.md.
   ```
   curl -X POST http://127.0.0.1:3000/v1/database/scamguard-7xwfd/call/report_verdict \
     -H "Authorization: Bearer $SPACETIME_TOKEN" -H 'Content-Type: application/json' \
     -d '["TEST01","FakeCoin Pro","high",["requests SMS read permission"],"Warning: ...","警告：……"]'
   # -> HTTP 200, empty body. HTTP 530 = your identity isn't the authorized service.
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

Identity: each `POST /v1/identity` call mints a NEW identity, on any server. Mint the service
token on Maincloud and keep it in `.env`. (Whether a local-server token works on Maincloud wasn't
tested; don't rely on it.)

## Identity lock (Sat 09:30)
`report_verdict` only accepts the identity stored in a private `config` table. Nothing is
hardcoded in the repo, and rotating the token doesn't need a republish.
- `init` records whoever publishes the module as the DB owner. The service starts unset, so
  every `report_verdict` is rejected until the owner authorizes one.
- Owner authorizes (or rotates) the service, using the CLI login that published:
  ```
  spacetime call --no-config --server maincloud <db> set_service_identity <identity-hex>
  ```
- Non-owners can't call `set_service_identity`; anonymous and other identities get HTTP 530 from
  `report_verdict`. All of this is checked by `scripts/smoke-test.sh` (17 checks).
- `init` only runs on a FRESH database. A DB published before this change has no config row, so
  everything is rejected: republish it with `--delete-data` (test data only) or use a new DB name.

## What was checked
- HTTP 200, and the row lands with the Chinese text and the `reasons` array intact (`spacetime sql`).
- Two TS SDK subscribers (stand-ins for the elder and family screens) filtered on
  `session_id = 'TEST01'` both got the insert live, at the same timestamp, with no polling.
- A verdict for a different session (`OTHER9`) reached neither subscriber.

## Gotchas
- When a client subscribes, existing rows also fire `onInsert`. The UI should treat those as
  history, not as a new alert.
- Never authorize the identity of a token that was ever committed or pasted somewhere public.
  The token in `py/.env` (commit dfb7fcc) is burned; its identity must not be authorized.

## Reproduce
```
spacetime start --listen-addr 127.0.0.1:3000
spacetime publish --server local --module-path spacetimedb -y scamguard-7xwfd
```
