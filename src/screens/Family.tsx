import { useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import { VerdictCard, sortNewestFirst } from '../components/VerdictCard';
import { useLang } from '../i18n';

// "Clear" only hides alerts on this phone: the verdicts stay in the database and
// on the elder's phone (view-only, HACK.md locked decision). We remember the
// newest cleared verdict's server timestamp, not this phone's clock.
const clearedKey = (session: string) => `cleared:${session}`;
function loadCleared(session: string): bigint {
  try {
    return BigInt(localStorage.getItem(clearedKey(session)) ?? '0');
  } catch {
    return 0n;
  }
}

// Screen C: the relative's device. View-only by design (HACK.md locked decision):
// no actions on a verdict, just the live feed for this session.
export function Family({ session }: { session: string }) {
  const [verdictRows, ready] = useTable(tables.verdict.where(r => r.sessionId.eq(session)));
  const [clearedAt, setClearedAt] = useState(() => loadCleared(session));
  // The value before the last Clear, so one accidental tap can be undone.
  const [undoTo, setUndoTo] = useState<bigint | null>(null);
  const verdicts = sortNewestFirst(verdictRows).filter(
    v => v.timestamp.microsSinceUnixEpoch > clearedAt
  );
  const { t } = useLang();

  function saveCleared(value: bigint) {
    setClearedAt(value);
    try {
      localStorage.setItem(clearedKey(session), value.toString());
    } catch {
      // storage blocked: cleared until this page reloads
    }
  }
  function clearAll() {
    const newest = verdicts[0]?.timestamp.microsSinceUnixEpoch;
    if (newest === undefined) return;
    setUndoTo(clearedAt);
    saveCleared(newest);
  }
  function undoClear() {
    if (undoTo === null) return;
    saveCleared(undoTo);
    setUndoTo(null);
  }

  // Rows already present when the subscription lands are history, not new alerts.
  const historyIds = useRef<Set<bigint> | null>(null);
  if (ready && historyIds.current === null) {
    historyIds.current = new Set(verdictRows.map(v => v.id));
  }
  const isNew = (id: bigint) => historyIds.current !== null && !historyIds.current.has(id);

  return (
    <main className="screen screen--wide">
      <p className="session-tag">
        {t('pairedWith')} {session}
      </p>
      <h1>{t('familyAlerts')}</h1>
      {!ready ? (
        <p className="empty">{t('loading')}</p>
      ) : verdicts.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">{t('noAlerts')}</p>
          <p className="hint">{t('noAlertsHint')}</p>
        </div>
      ) : (
        <ul className="feed">
          {verdicts.map(v => (
            <li key={v.id.toString()} className={isNew(v.id) ? 'feed__item--new' : undefined}>
              {isNew(v.id) && <span className="new-pill">{t('newBadge')}</span>}
              <VerdictCard verdict={v} />
            </li>
          ))}
        </ul>
      )}
      {undoTo !== null && verdicts.length === 0 ? (
        <button className="btn btn--secondary clear-btn" onClick={undoClear}>
          {t('undoClear')}
        </button>
      ) : (
        ready &&
        verdicts.length > 0 && (
          <button className="btn btn--secondary clear-btn" onClick={clearAll}>
            {t('clearAlerts')}
          </button>
        )
      )}
    </main>
  );
}
