import { schema, table, t } from 'spacetimedb/server';

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
});
export default spacetimedb;

// Called by Sophia's analysis pipeline.
// TODO (PENDING Sophia): reject callers that aren't the analysis service's
// identity. Until then anyone who knows the DB name can insert verdicts, so
// don't publish this to Maincloud for the demo without that check.
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
    ctx.db.verdict.insert({ id: 0n, ...args, timestamp: ctx.timestamp });
  }
);
