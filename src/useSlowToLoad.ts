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

export const CANT_CONNECT = '无法连接服务器，请检查网络。 · Can’t reach the server. Check your internet connection.';
