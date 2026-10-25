import { useEffect, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import { VerdictCard, sortNewestFirst } from '../components/VerdictCard';
import { useLang, type StringKey } from '../i18n';
import { extractLink, type ExtractedLink } from '../links';

// Sophia's analysis service. The /analyze path and form field names are
// Anthony's assumption until Sophia's service exists (see HACK.md status log).
const ANALYSIS_URL = import.meta.env.VITE_ANALYSIS_URL as string | undefined;

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'waiting'; knownIds: Set<bigint> }
  | { kind: 'error'; key: StringKey };

const RESULT_TIMEOUT_MS = 60_000;

function sharedText(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get('text');
}

// Screen A: the elder's device. Upload an APK; the verdict arrives through
// SpacetimeDB (not the HTTP response), the same way the family view gets it.
export function Scan({ session }: { session: string }) {
  const [verdictRows, ready] = useTable(tables.verdict.where(r => r.sessionId.eq(session)));
  const verdicts = sortNewestFirst(verdictRows);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const fileInput = useRef<HTMLInputElement>(null);
  const { t } = useLang();

  // A verdict that wasn't there when we uploaded is this upload's result.
  const fresh =
    status.kind === 'waiting' ? verdicts.find(v => !status.knownIds.has(v.id)) : undefined;
  const resultRef = useRef<HTMLElement>(null);
  const [scrollPending, setScrollPending] = useState(false);
  useEffect(() => {
    if (!fresh) return;
    setStatus({ kind: 'idle' });
    setScrollPending(true);
  }, [fresh]);
  // Scroll only once the spinner row is gone: scrolling in the same render
  // aimed too low and clipped the "Result" heading.
  useEffect(() => {
    if (!scrollPending || status.kind !== 'idle') return;
    setScrollPending(false);
    // On a phone the result can land below the fold; bring it into view.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [scrollPending, status]);

  // If the pipeline never reports, don't leave the elder stuck on a spinner.
  useEffect(() => {
    if (status.kind !== 'waiting') return;
    const timer = setTimeout(
      () => setStatus({ kind: 'error', key: 'noResult' }),
      RESULT_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, [status]);

  // Two paths into the same verdict table (HACK.md): APK files get static
  // analysis; links get URL/redirect checks only, never an APK download.
  async function submit(path: string, init: RequestInit) {
    if (!ANALYSIS_URL) {
      console.warn('VITE_ANALYSIS_URL is not set');
      setStatus({ kind: 'error', key: 'notConnected' });
      return;
    }
    const knownIds = new Set(verdicts.map(v => v.id));
    setStatus({ kind: 'uploading' });
    try {
      // ngrok's free tier can answer browsers with a warning page instead of
      // the API; this header skips it (the service's CORS allows it). It makes
      // every request preflighted, so drop it if we move off ngrok.
      const headers = { 'ngrok-skip-browser-warning': '1', ...init.headers };
      const res = await fetch(`${ANALYSIS_URL}${path}`, { method: 'POST', ...init, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus({ kind: 'waiting', knownIds });
    } catch (err) {
      // The elder sees a calm sentence; the technical reason goes to the console.
      console.warn('analysis request failed:', (err as Error).message);
      setStatus({ kind: 'error', key: 'sendFailed' });
    }
  }

  function uploadFile(file: File) {
    const body = new FormData();
    body.append('file', file);
    body.append('session_id', session);
    submit('/analyze', { body });
  }

  // `message` (optional, agreed with Sophia): the whole pasted text, so her
  // rules can score the sender, urgency wording and the "reply Y" trick. Claude
  // sees only the rules' findings, not the message. Omitted when the paste is just the link.
  function checkLink(link: ExtractedLink, pasted: string) {
    const normalized = pasted.normalize('NFKC').replace(/\u3002/g, '.');
    const besidesLink = [link.written, link.written.replace(/^https?:\/\//i, '')]
      .reduce((text, form) => text.replace(form, ''), normalized)
      .replace(/[\s\p{P}]/gu, '');
    // Cap by code points so an emoji isn't split in half.
    const message = Array.from(pasted.trim()).slice(0, 4000).join('');
    submit('/analyze-url', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: link.url, session_id: session, ...(besidesLink ? { message } : {}) }),
    });
  }

  // Android Phase 2 opens /elder?session=…#text=<shared message>, so the same
  // extractLink + "Will check" preview runs here instead of being rewritten in
  // Kotlin. The elder still taps Check; nothing is sent automatically. It's a
  // #fragment, not ?query, so the SMS never reaches the web host's logs.
  const [link, setLink] = useState(() => sharedText() ?? '');
  useEffect(() => {
    // Drop the message from the address bar so a refresh doesn't refill it
    // and it doesn't linger in history.
    const clear = () => window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (sharedText() !== null) clear();
    // A second share into an already-open page only changes the fragment, which
    // doesn't reload or remount, so pick it up here too.
    const onHash = () => {
      const text = sharedText();
      if (text === null) return;
      setLink(text);
      clear();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const found = extractLink(link);

  const sending = status.kind === 'uploading' || status.kind === 'waiting';
  // Until history has loaded we can't tell a new verdict from an old one.
  const busy = sending || !ready;
  const latest = verdicts[0];

  return (
    <main className="screen">
      {/* Big enough to read off when the elder holds the phone out to a
          relative: Continue may have been tapped before the family paired. */}
      <div className="pair-code">
        <span className="session-tag">{t('codeForFamily')}</span>
        <span className="pair-code__value" role="img" aria-label={`${t('pairingCodeIs')} ${session.split('').join(' ')}`}>
          {session}
        </span>
      </div>
      <h1>{t('checkAnApp')}</h1>

      <input
        ref={fileInput}
        type="file"
        accept=".apk,application/vnd.android.package-archive"
        hidden
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
          e.target.value = '';
        }}
      />
      <button
        className="btn btn--primary btn--big"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        {t('chooseApk')}
      </button>

      <form
        className="link-form"
        onSubmit={e => {
          e.preventDefault();
          if (found && !busy) checkLink(found, link);
        }}
      >
        <label htmlFor="link">{t('orPasteLink')}</label>
        <p className="hint link-hint" id="link-hint">
          {t('wholeMessageOk')}
        </p>
        {/* textarea, not input: an <input> strips line breaks from pasted
            messages, gluing "https://evil.top." onto the next line's words. */}
        <textarea
          id="link"
          className="link-input"
          rows={3}
          aria-describedby="link-hint"
          placeholder="https://…"
          value={link}
          onChange={e => setLink(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {found && link.trim() !== found.url && (
          <p className="hint link-preview">
            {t('willCheck')} {found.url}
            {/* Host as written differs from the real host (non-Latin letters, user@host):
                show both so the trick is visible. Risk is the service's call. */}
            {found.hostDiffers && (
              <>
                <br />
                {t('writtenAs')} {found.written}
              </>
            )}
          </p>
        )}
        <button className="btn btn--secondary" type="submit" disabled={!found || busy}>
          {t('checkLink')}
        </button>
      </form>

      {sending && (
        <div className="loading" role="status">
          <span className="spinner" aria-hidden />
          {t('checking')}
        </div>
      )}
      {status.kind === 'error' && (
        <p className="error" role="alert">
          {t(status.key)}
        </p>
      )}

      <section aria-live="polite" ref={resultRef} className="result">
        {!ready ? null : latest ? (
          <>
            <h2>{sending ? t('lastCheck') : t('result')}</h2>
            <VerdictCard verdict={latest} large />
          </>
        ) : (
          !sending && <p className="empty">{t('noChecks')}</p>
        )}
      </section>
    </main>
  );
}
