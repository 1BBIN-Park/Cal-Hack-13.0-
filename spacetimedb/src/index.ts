import { schema, table, t, SenderError } from 'spacetimedb/server';

// Verdict contract agreed by Sophia + Anthony (see HACK.md). Changes need both.
const spacetimedb = schema({
  verdict: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      session_id: t.string().index('btree'),
      app_name: t.string(),
      risk_level: t.string(), // "low" | "medium" | "high"
      reasons: t.array(t.string()), // from rule engine
      explanation_en: t.string(),
      explanation_zh: t.string(),
      timestamp: t.timestamp(), // set by the reducer, not the caller
    }
  ),
  // Private, single row. Who may write verdicts is set at runtime by the DB
  // owner, so no identity is hardcoded in this (public) repo and the service
  // token can be rotated without republishing.
  config: table(
    {},
    {
      id: t.u32().primaryKey(), // always 0
      owner: t.identity(), // whoever published the module
      service_hex: t.string(), // analysis service identity; '' = nobody yet
    }
  ),
});
export default spacetimedb;

export const init = spacetimedb.init(ctx => {
  ctx.db.config.insert({ id: 0, owner: ctx.sender, service_hex: '' });
});

// Owner only: `spacetime call <db> set_service_identity <hex>` with the CLI
// login that published. Hex is what POST /v1/identity returns as `identity`.
export const set_service_identity = spacetimedb.reducer({ hex: t.string() }, (ctx, { hex }) => {
  const config = ctx.db.config.id.find(0);
  if (!config || !config.owner.equals(ctx.sender)) throw new SenderError('only the database owner can do this');
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new SenderError('expected a 64-character hex identity');
  ctx.db.config.id.update({ ...config, service_hex: normalized });
});

// Called by Sophia's analysis pipeline, and only it: anyone else who knows the
// DB name (it ships in the web bundle) is rejected.
export const report_verdict = spacetimedb.reducer(
  {
    session_id: t.string(),
    app_name: t.string(),
    risk_level: t.string(),
    reasons: t.array(t.string()),
    explanation_en: t.string(),
    explanation_zh: t.string(),
  },
  (ctx, args) => {
    const config = ctx.db.config.id.find(0);
    if (!config || config.service_hex === '' || ctx.sender.toHexString() !== config.service_hex) {
      throw new SenderError('not the analysis service');
    }
    ctx.db.verdict.insert({ id: 0n, ...args, timestamp: ctx.timestamp });
  }
);
