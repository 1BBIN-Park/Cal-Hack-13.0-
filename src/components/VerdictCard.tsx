import { useEffect, useState } from 'react';
import type { Verdict } from '../module_bindings/types';

const RISK_LABEL: Record<string, { en: string; zh: string; icon: string }> = {
  high: { en: 'High risk', zh: '高风险', icon: '\u26A0\uFE0E' }, // text style, not the color emoji
  medium: { en: 'Medium risk', zh: '中等风险', icon: '!' },
  low: { en: 'Low risk', zh: '低风险', icon: '✓' },
};

// Re-render periodically so "2 min ago" stays true.
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function timeAgo(date: Date, now: number): string {
  const s = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (s < 60) return '刚刚 · just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前 · ${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前 · ${h} h ago`;
  return date.toLocaleString();
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
  const now = useNow(30_000);
  const risk = RISK_LABEL[verdict.riskLevel] ?? { en: verdict.riskLevel, zh: verdict.riskLevel, icon: '?' };
  const when = verdict.timestamp.toDate();

  return (
    <article className={`verdict verdict--${verdict.riskLevel}${large ? ' verdict--large' : ''}`}>
      <p className="verdict__risk">
        <span className="verdict__icon" aria-hidden>
          {risk.icon}
        </span>
        {risk.zh} · {risk.en}
      </p>
      <h2 className="verdict__app">{verdict.appName}</h2>

      <section className="verdict__ai" aria-label="AI explanation">
        <p className="verdict__source">AI 解释 · AI explanation (Claude)</p>
        <p className="verdict__text" lang="zh">
          {verdict.explanationZh}
        </p>
        <p className="verdict__text" lang="en">
          {verdict.explanationEn}
        </p>
      </section>

      {verdict.reasons.length > 0 && (
        <section className="verdict__facts" aria-label="Rule findings">
          <p className="verdict__source">规则检测 · Found by rules</p>
          <ul>
            {verdict.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="verdict__time">
        <time dateTime={when.toISOString()} title={when.toLocaleString()}>
          {timeAgo(when, now)}
        </time>
      </footer>
    </article>
  );
}
