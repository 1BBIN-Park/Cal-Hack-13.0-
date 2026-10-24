import { useRef } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import { VerdictCard, sortNewestFirst } from '../components/VerdictCard';
import { useLang } from '../i18n';

// Screen C: the relative's device. View-only by design (HACK.md locked decision):
// no actions on a verdict, just the live feed for this session.
export function Family({ session }: { session: string }) {
  const [verdictRows, ready] = useTable(tables.verdict.where(r => r.sessionId.eq(session)));
  const verdicts = sortNewestFirst(verdictRows);
  const { t } = useLang();

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
    </main>
  );
}
