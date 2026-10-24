// Stand-in for an elder/family screen: subscribes to one session's verdicts
// and prints one JSON line per row. Bundled and run by scripts/smoke-test.sh.
// Usage: node subscriber.mjs <host> <db> <session> <label> <seconds>
import { DbConnection } from '../../src/module_bindings/index.ts';

const [host, db, session, label, seconds] = process.argv.slice(2);
// session goes straight into SQL below: only ever pass script-controlled codes.
if (!/^[A-Z0-9]+$/.test(session)) throw new Error(`bad session: ${session}`);
let applied = false;

DbConnection.builder()
  .withUri(host)
  .withDatabaseName(db)
  .onConnect(conn => {
    conn.db.verdict.onInsert((_ctx, v) => {
      console.log(
        JSON.stringify({
          label,
          live: applied, // false = row was already there when we subscribed
          session: v.sessionId,
          app: v.appName,
          zh: v.explanationZh,
          reasons: v.reasons,
        })
      );
    });
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        applied = true;
        console.log(JSON.stringify({ label, subscribed: true }));
      })
      .subscribe([`SELECT * FROM verdict WHERE session_id = '${session}'`]);
  })
  .onConnectError((_ctx, err) => {
    console.log(JSON.stringify({ label, error: String(err) }));
    process.exit(1);
  })
  .build();

setTimeout(() => process.exit(0), Number(seconds) * 1000);
