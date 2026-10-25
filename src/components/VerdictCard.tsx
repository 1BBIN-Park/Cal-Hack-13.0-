import { useEffect, useState } from 'react';
import type { Verdict } from '../module_bindings/types';
import { useLang, type Lang, type StringKey } from '../i18n';

const RISK: Record<string, { key: StringKey; icon: string }> = {
  high: { key: 'highRisk', icon: '⚠︎' }, // text style, not the color emoji
  medium: { key: 'mediumRisk', icon: '!' },
  low: { key: 'lowRisk', icon: 'i' }, // not ✓: a domain-only check isn't "safe"
};

// Fixed "what to do" text by risk level, for the elder's card and the family's.
const NEXT: Record<string, { elder: StringKey; family: StringKey }> = {
  high: { elder: 'nextHighElder', family: 'nextHighFamily' },
  medium: { elder: 'nextMediumElder', family: 'nextMediumFamily' },
  low: { elder: 'nextLowElder', family: 'nextLowFamily' },
};

// The service's canned text when the Claude call fails. It isn't Claude's
// writing, so it must not appear under the Claude label (HACK.md locked decision).
const CANNED = /^(We couldn't generate|我们暂时无法生成)/;

// A link verdict's app_name is the URL: title it by host, show the full URL small.
function splitUrl(name: string): { title: string; url?: string } {
  if (!/^https?:\/\//i.test(name)) return { title: name };
  try {
    return { title: new URL(name).hostname, url: name };
  } catch {
    return { title: name };
  }
}

// Re-render periodically so "2 min ago" stays true.
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function timeAgo(date: Date, now: number, lang: Lang): string {
  const s = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (s < 60) return lang === 'zh' ? '刚刚' : 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return lang === 'zh' ? `${m} 分钟前` : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === 'zh' ? `${h} 小时前` : `${h} h ago`;
  return date.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US');
}

// Newest first. Auto-inc ids aren't ordered, so sort by the reducer timestamp.
export function sortNewestFirst(verdicts: readonly Verdict[]): Verdict[] {
  return [...verdicts].sort((a, b) =>
    Number(b.timestamp.microsSinceUnixEpoch - a.timestamp.microsSinceUnixEpoch)
  );
}

// The two halves are labeled on purpose (HACK.md locked decision): the rules
// engine decides the risk and finds the reasons; Claude only explains them.
export function VerdictCard({ verdict, large = false }: { verdict: Verdict; large?: boolean }) {
  const { lang, t } = useLang();
  const now = useNow(30_000);
  const risk = RISK[verdict.riskLevel];
  const when = verdict.timestamp.toDate();
  const explanation = (lang === 'zh' ? verdict.explanationZh : verdict.explanationEn).trim();
  const fromClaude = explanation !== '' && !CANNED.test(explanation);
  const next = NEXT[verdict.riskLevel];
  const { title, url } = splitUrl(verdict.appName);

  return (
    <article className={`verdict verdict--${verdict.riskLevel}${large ? ' verdict--large' : ''}`}>
      <p className="verdict__risk">
        <span className="verdict__icon" aria-hidden>
          {risk?.icon ?? '?'}
        </span>
        {risk ? t(risk.key) : verdict.riskLevel}
      </p>
      <h2 className="verdict__app">{title}</h2>
      {url && <p className="verdict__url">{url}</p>}

      {next && (
        <section className="verdict__next" aria-label={t('nextStep')}>
          <p className="verdict__source">{t('nextStep')}</p>
          <p className="verdict__step">{t(large ? next.elder : next.family)}</p>
        </section>
      )}

      {fromClaude && (
        <section className="verdict__ai" aria-label={t('aiExplanation')}>
          <p className="verdict__source">{t('aiExplanation')}</p>
          <p className="verdict__text" lang={lang === 'zh' ? 'zh-CN' : 'en'}>
            {explanation}
          </p>
        </section>
      )}

      {verdict.reasons.length > 0 && (
        <section className="verdict__facts" aria-label={t('foundByRules')}>
          <p className="verdict__source">{t('foundByRules')}</p>
          {/* Rule reasons come from Sophia's engine in English only. */}
          <ul lang="en">
            {verdict.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="verdict__time">
        <time dateTime={when.toISOString()} title={when.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}>
          {timeAgo(when, now, lang)}
        </time>
      </footer>
    </article>
  );
}
