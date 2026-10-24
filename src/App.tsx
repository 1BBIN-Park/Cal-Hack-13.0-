import { useEffect } from 'react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { navigate, useLocation } from './router';
import { useSlowToLoad } from './useSlowToLoad';
import { LangToggle, useLang } from './i18n';
import { clearPairing, isValidCode, loadPairing, normalizeCode } from './session';
import { Pairing } from './screens/Pairing';
import { Scan } from './screens/Scan';
import { Family } from './screens/Family';

function App() {
  const { isActive: connected } = useSpacetimeDB();
  // One offline signal for every screen, including drops mid-session.
  const slow = useSlowToLoad(connected);
  const { path, params } = useLocation();
  const { t } = useLang();
  const session = normalizeCode(params.get('session') ?? '');

  // Returning visitor on "/": go straight back to their screen.
  useEffect(() => {
    if (path !== '/') return;
    const saved = loadPairing();
    if (saved && (saved.role === 'elder' || saved.role === 'family') && isValidCode(saved.code)) {
      navigate(`/${saved.role}?session=${saved.code}`);
    }
  }, [path]);

  const pairedRoute = path === '/elder' || path === '/family';
  const paired = pairedRoute && isValidCode(session);

  let screen;
  if (paired) {
    // key: a new session starts with fresh state (no stale "waiting" or NEW marks).
    screen =
      path === '/elder' ? <Scan key={session} session={session} /> : <Family key={session} session={session} />;
  } else {
    // A bad or missing code in a shared link: say so instead of silently resetting.
    screen = <Pairing invalidLink={pairedRoute} />;
  }

  return (
    <>
      {!connected && (
        <div className={slow ? 'offline offline--down' : 'offline'} role="status">
          {slow ? t('cantConnect') : t('connecting')}
        </div>
      )}
      <div className="topbar">
        <LangToggle />
      </div>
      {screen}
      {paired && (
        <button
          className="btn btn--link unpair"
          onClick={() => {
            clearPairing();
            navigate('/');
          }}
        >
          {t('unpair')}
        </button>
      )}
    </>
  );
}

export default App;
