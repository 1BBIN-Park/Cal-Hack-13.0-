import { useEffect, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import { VerdictCard, sortNewestFirst } from '../components/VerdictCard';

// Sophia's analysis service. The /analyze path and form field names are
// Anthony's assumption until Sophia's service exists (see HACK.md status log).
const ANALYSIS_URL = import.meta.env.VITE_ANALYSIS_URL as string | undefined;

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'waiting'; knownIds: Set<bigint> }
  | { kind: 'error'; message: string };

const RESULT_TIMEOUT_MS = 60_000;

// Elders paste whole SMS messages or bare domains, so pull out the first URL
// and add a scheme when it's missing.
export function extractUrl(text: string): string | null {
  // ASCII URL characters only: Chinese SMS text has no spaces to end the URL.
  const withScheme = text.match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+;=%]+/i);
  if (withScheme) return withScheme[0].replace(/[.,;:!?)\]]+$/, '');
  const bare = text.match(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}\b(\/[^\s<>"']*)?/i);
  return bare ? `https://${bare[0]}` : null;
}

// Screen A: the elder's device. Upload an APK; the verdict arrives through
// SpacetimeDB (not the HTTP response), the same way the family view gets it.
export function Scan({ session }: { session: string }) {
  const [verdictRows, ready] = useTable(tables.verdict.where(r => r.sessionId.eq(session)));
  const verdicts = sortNewestFirst(verdictRows);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const fileInput = useRef<HTMLInputElement>(null);

  // A verdict that wasn't there when we uploaded is this upload's result.
  const fresh =
    status.kind === 'waiting' ? verdicts.find(v => !status.knownIds.has(v.id)) : undefined;
  useEffect(() => {
    if (fresh) setStatus({ kind: 'idle' });
  }, [fresh]);

  // If the pipeline never reports, don't leave the elder stuck on a spinner.
  useEffect(() => {
    if (status.kind !== 'waiting') return;
    const timer = setTimeout(
      () => setStatus({ kind: 'error', message: '还没有结果，请再试一次 · No result yet, please try again.' }),
      RESULT_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, [status]);

  // Two paths into the same verdict table (HACK.md): APK files get static
  // analysis; links get URL/redirect checks only, never an APK download.
  async function submit(path: string, init: RequestInit) {
    if (!ANALYSIS_URL) {
      setStatus({ kind: 'error', message: 'Analysis service not connected (VITE_ANALYSIS_URL unset).' });
      return;
    }
    const knownIds = new Set(verdicts.map(v => v.id));
    setStatus({ kind: 'uploading' });
    try {
      const res = await fetch(`${ANALYSIS_URL}${path}`, { method: 'POST', ...init });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus({ kind: 'waiting', knownIds });
    } catch (err) {
      setStatus({ kind: 'error', message: `Send failed: ${(err as Error).message}` });
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

  const [link, setLink] = useState('');
  const linkUrl = extractUrl(link);

  const sending = status.kind === 'uploading' || status.kind === 'waiting';
  // Until history has loaded we can't tell a new verdict from an old one.
  const busy = sending || !ready;
  const latest = verdicts[0];

  return (
    <main className="screen">
      <p className="session-tag">配对码 · Code: {session}</p>
      <h1>检查应用 · Check an app</h1>

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
        选择安装包 (APK)
        <small>Choose an APK file</small>
      </button>

      <form
        className="link-form"
        onSubmit={e => {
          e.preventDefault();
          if (linkUrl && !busy) checkLink(linkUrl);
        }}
      >
        <label htmlFor="link">或粘贴链接 · Or paste a link</label>
        <input
          id="link"
          className="link-input"
          type="text"
          inputMode="url"
          placeholder="https://… (可以粘贴整条短信 · whole message is OK)"
          value={link}
          onChange={e => setLink(e.target.value)}
          autoComplete="off"
        />
        {linkUrl && link.trim() !== linkUrl && (
          <p className="hint link-preview">将检查 · Will check: {linkUrl}</p>
        )}
        <button className="btn btn--secondary" type="submit" disabled={!linkUrl || busy}>
          检查链接 · Check link
        </button>
      </form>

      {sending && (
        <div className="loading" role="status">
          <span className="spinner" aria-hidden />
          正在检查，请稍候… · Checking, please wait…
        </div>
      )}
      {status.kind === 'error' && (
        <p className="error" role="alert">
          {status.message}
        </p>
      )}

      <section aria-live="polite">
        {!ready ? null : latest ? (
          <>
            <h2>{sending ? '上次检查 · Last check' : '检查结果 · Result'}</h2>
            <VerdictCard verdict={latest} large />
          </>
        ) : (
          <p className="empty">还没有检查记录 · No checks yet</p>
        )}
      </section>
    </main>
  );
}
