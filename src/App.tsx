import { useEffect } from 'react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { navigate, useLocation } from './router';
import { clearPairing, isValidCode, loadPairing, normalizeCode } from './session';
import { Pairing } from './screens/Pairing';
import { Scan } from './screens/Scan';
import { Family } from './screens/Family';

function App() {
  const { isActive: connected } = useSpacetimeDB();
  const { path, params } = useLocation();
  const session = normalizeCode(params.get('session') ?? '');

  // Returning visitor on "/": go straight back to their screen.
  useEffect(() => {
    if (path !== '/') return;
    const saved = loadPairing();
    if (saved && (saved.role === 'elder' || saved.role === 'family') && isValidCode(saved.code)) {
      navigate(`/${saved.role}?session=${saved.code}`);
    }
  }, [path]);

  let screen;
  if ((path === '/elder' || path === '/family') && isValidCode(session)) {
    // key: a new session starts with fresh state (no stale "waiting" or NEW marks).
    screen =
      path === '/elder' ? <Scan key={session} session={session} /> : <Family key={session} session={session} />;
  } else {
    screen = <Pairing />;
  }

  return (
    <>
      {!connected && (
        <div className="offline" role="status">
          正在连接… · Connecting to server…
        </div>
      )}
      {screen}
      {path !== '/' && (
        <button
          className="btn btn--link unpair"
          onClick={() => {
            clearPairing();
            navigate('/');
          }}
        >
          取消配对 · Unpair
        </button>
      )}
    </>
  );
}

export default App;
