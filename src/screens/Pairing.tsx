import { useState } from 'react';
import { isValidCode, newPairingCode, normalizeCode, savePairing } from '../session';
import { navigate } from '../router';
import { useLang } from '../i18n';
import { FamilyIcon, Logo, ShieldIcon } from '../components/Logo';

// Screen B: both devices. The elder's device makes a code; the relative types it in.
export function Pairing({ invalidLink = false }: { invalidLink?: boolean }) {
  const [mode, setMode] = useState<'choose' | 'elder' | 'family'>('choose');
  const [code] = useState(newPairingCode);
  const [input, setInput] = useState('');
  const entered = normalizeCode(input);
  const { t } = useLang();

  if (mode === 'elder') {
    return (
      <main className="screen">
        <h1>{t('yourCode')}</h1>
        <p className="hint">{t('giveCode')}</p>
        <p className="code" role="img" aria-label={`${t('pairingCodeIs')} ${code.split('').join(' ')}`}>
          {code.split('').map((c, i) => (
            <span key={i} className="code__tile" aria-hidden>
              {c}
            </span>
          ))}
        </p>
        <button
          className="btn btn--primary"
          onClick={() => {
            savePairing('elder', code);
            navigate(`/elder?session=${code}`);
          }}
        >
          {t('continue')}
        </button>
        <button className="btn btn--link" onClick={() => setMode('choose')}>
          {t('back')}
        </button>
      </main>
    );
  }

  if (mode === 'family') {
    return (
      <main className="screen">
        <h1>{t('enterCode')}</h1>
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
            {t('pair')}
          </button>
        </form>
        <button className="btn btn--link" onClick={() => setMode('choose')}>
          {t('back')}
        </button>
      </main>
    );
  }

  return (
    <main className="screen">
      <header className="hero">
        <Logo size={64} />
        <h1 className="hero__title">{t('appName')}</h1>
        <p className="hint">{t('tagline')}</p>
      </header>
      {invalidLink && (
        <p className="error" role="alert">
          {t('invalidLink')}
        </p>
      )}
      <button className="btn btn--primary btn--big" onClick={() => setMode('elder')}>
        <ShieldIcon />
        {t('iCheckApp')}
      </button>
      <button className="btn btn--secondary btn--big" onClick={() => setMode('family')}>
        <FamilyIcon />
        {t('iAmFamily')}
      </button>
    </main>
  );
}
