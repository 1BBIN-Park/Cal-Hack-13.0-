import { useRef } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import { VerdictCard, sortNewestFirst } from '../components/VerdictCard';

// Screen C: the relative's device. View-only by design (HACK.md locked decision):
// no actions on a verdict, just the live feed for this session.
export function Family({ session }: { session: string }) {
  const [verdictRows, ready] = useTable(tables.verdict.where(r => r.sessionId.eq(session)));
  const verdicts = sortNewestFirst(verdictRows);

  // Rows already present when the subscription lands are history, not new alerts.
  const historyIds = useRef<Set<bigint> | null>(null);
  if (ready && historyIds.current === null) {
    historyIds.current = new Set(verdictRows.map(v => v.id));
  }
  const isNew = (id: bigint) => historyIds.current !== null && !historyIds.current.has(id);

  return (
    <main className="screen screen--wide">
      <p className="session-tag">Paired with code {session}</p>
      <h1>Family alerts · 家人提醒</h1>
      {!ready ? (
        <p className="empty">Connecting…</p>
      ) : verdicts.length === 0 ? (
        <p className="empty">No alerts yet · 暂无警报</p>
      ) : (
        <ul className="feed">
          {verdicts.map(v => (
            <li key={v.id.toString()} className={isNew(v.id) ? 'feed__item--new' : undefined}>
              {isNew(v.id) && <span className="new-pill">NEW</span>}
              <VerdictCard verdict={v} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
