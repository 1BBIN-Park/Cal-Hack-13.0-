import { useEffect, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import { VerdictCard, sortNewestFirst } from '../components/VerdictCard';
import { useLang, type StringKey } from '../i18n';

// Sophia's analysis service. The /analyze path and form field names are
// Anthony's assumption until Sophia's service exists (see HACK.md status log).
const ANALYSIS_URL = import.meta.env.VITE_ANALYSIS_URL as string | undefined;

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'waiting'; knownIds: Set<bigint> }
  | { kind: 'error'; key: StringKey; detail?: string };

const RESULT_TIMEOUT_MS = 60_000;

// Elders paste whole SMS messages or bare domains, so pull out the first URL
// and add a scheme when it's missing.
export function extractUrl(input: string): string | null {
  // Cap the work on huge pastes (the join regex is quadratic on junk input).
  const text = input.slice(0, 4000);
  // Text copied out of a screenshot (iPhone Live Text) keeps the visual line
  // breaks, splitting links like "https://fideitly-\nintenrational.top/\n...".
  // Rejoin only when the next line itself looks like URL text (lowercase start
  // and a connector, or nothing else on the line), so "https://evil.top.\nclick
  // to confirm" stays evil.top and a following sentence isn't glued on.
  let joined = text;
  for (let prev = ''; prev !== joined; ) {
    prev = joined;
    joined = joined.replace(
      /([Hh][Tt][Tt][Pp][Ss]?:\/\/\S*[-/.?=&])[ \t]*\r?\n[ \t]*(?=[a-z0-9]\S*(?:[-/.?=&]|[ \t]*(?:\r?\n|$)))/,
      '$1'
    );
  }
  // ASCII URL characters only: Chinese SMS text has no spaces to end the URL.
  const withScheme = joined.match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+;=%]+/i);
  if (withScheme) return withScheme[0].replace(/[.,;:!?)\]]+$/, '');
  const bare = text.match(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}\b(\/[^\s<>"']*)?/i);
  return bare ? `https://${bare[0]}` : null;
}

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
  useEffect(() => {
    if (!fresh) return;
    setStatus({ kind: 'idle' });
    // On a phone the result can land below the fold; bring it into view.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [fresh]);

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
      setStatus({ kind: 'error', key: 'notConnected' });
      return;
    }
    const knownIds = new Set(verdicts.map(v => v.id));
    setStatus({ kind: 'uploading' });
    try {
      const res = await fetch(`${ANALYSIS_URL}${path}`, { method: 'POST', ...init });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus({ kind: 'waiting', knownIds });
    } catch (err) {
      setStatus({ kind: 'error', key: 'sendFailed', detail: (err as Error).message });
    }
  }

  function uploadFile(file: File) {
    const body = new FormData();
    body.append('file', file);
    body.append('session_id', session);
    submit('/analyze', { body });
  }

  function checkLink(url: string) {
    submit('/analyze-url', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, session_id: session }),
    });
  }

  // Android Phase 2 opens /elder?session=…#text=<shared message>, so the same
  // extractUrl + "Will check" preview runs here instead of being rewritten in
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
  const linkUrl = extractUrl(link);

  const sending = status.kind === 'uploading' || status.kind === 'waiting';
  // Until history has loaded we can't tell a new verdict from an old one.
  const busy = sending || !ready;
  const latest = verdicts[0];

  return (
    <main className="screen">
      <p className="session-tag">
        {t('code')}: {session}
      </p>
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
          if (linkUrl && !busy) checkLink(linkUrl);
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
        {linkUrl && link.trim() !== linkUrl && (
          <p className="hint link-preview">
            {t('willCheck')} {linkUrl}
          </p>
        )}
        <button className="btn btn--secondary" type="submit" disabled={!linkUrl || busy}>
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
          {status.detail && ` ${status.detail}`}
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
