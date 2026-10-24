import { useState } from 'react';
import { isValidCode, newPairingCode, normalizeCode, savePairing } from '../session';
import { navigate } from '../router';

// Screen B: both devices. The elder's device makes a code; the relative types it in.
export function Pairing() {
  const [mode, setMode] = useState<'choose' | 'elder' | 'family'>('choose');
  const [code] = useState(newPairingCode);
  const [input, setInput] = useState('');
  const entered = normalizeCode(input);

  if (mode === 'elder') {
    return (
      <main className="screen">
        <h1>您的配对码 · Your pairing code</h1>
        <p className="hint">
          请把这个码告诉您的家人。
          <br />
          Give this code to a family member.
        </p>
        <p className="code" aria-label={`Pairing code ${code.split('').join(' ')}`}>
          {code}
        </p>
        <button
          className="btn btn--primary"
          onClick={() => {
            savePairing('elder', code);
            navigate(`/elder?session=${code}`);
          }}
        >
          继续 · Continue
        </button>
        <button className="btn btn--link" onClick={() => setMode('choose')}>
          返回 · Back
        </button>
      </main>
    );
  }

  if (mode === 'family') {
    return (
      <main className="screen">
        <h1>输入配对码 · Enter pairing code</h1>
        <form
          onSubmit={e => {
            e.preventDefault();
            if (!isValidCode(entered)) return;
            savePairing('family', entered);
            navigate(`/family?session=${entered}`);
          }}
        >
          <input
            className="code-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="ABC234"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={8}
            autoFocus
          />
          <button className="btn btn--primary" type="submit" disabled={!isValidCode(entered)}>
            配对 · Pair
          </button>
        </form>
        <button className="btn btn--link" onClick={() => setMode('choose')}>
          返回 · Back
        </button>
      </main>
    );
  }

  return (
    <main className="screen">
      <h1>应用安全检查 · Scam App Check</h1>
      <button className="btn btn--primary btn--big" onClick={() => setMode('elder')}>
        我要检查应用
        <small>I want to check an app</small>
      </button>
      <button className="btn btn--secondary btn--big" onClick={() => setMode('family')}>
        我是家人
        <small>I'm a family member</small>
      </button>
    </main>
  );
}
