import { useEffect, useState } from 'react';

// Tiny path router: three screens don't need a routing library.
// Paths match HACK.md (the Android WebView opens /elder?session=<code>).
export function navigate(to: string) {
  window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useLocation() {
  const [loc, setLoc] = useState(() => ({
    path: window.location.pathname,
    params: new URLSearchParams(window.location.search),
  }));
  useEffect(() => {
    const onPop = () =>
      setLoc({
        path: window.location.pathname,
        params: new URLSearchParams(window.location.search),
      });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return loc;
}
