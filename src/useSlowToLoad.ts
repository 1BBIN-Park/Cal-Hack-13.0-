import { useEffect, useState } from 'react';

// True once `ok` has stayed false for `ms`: time to tell the user the server
// can't be reached instead of "Connecting…" (the SDK keeps retrying meanwhile).
export function useSlowToLoad(ok: boolean, ms = 10_000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (ok) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(id);
  }, [ok, ms]);
  return slow;
}
