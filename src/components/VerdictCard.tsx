import type { Verdict } from '../module_bindings/types';

const RISK_LABEL: Record<string, { en: string; zh: string }> = {
  high: { en: 'High risk', zh: '高风险' },
  medium: { en: 'Medium risk', zh: '中等风险' },
  low: { en: 'Low risk', zh: '低风险' },
};

export function formatTime(v: Verdict): string {
  return v.timestamp.toDate().toLocaleString();
}

// Newest first. Auto-inc ids aren't ordered, so sort by the reducer timestamp.
export function sortNewestFirst(verdicts: readonly Verdict[]): Verdict[] {
  return [...verdicts].sort((a, b) =>
    Number(b.timestamp.microsSinceUnixEpoch - a.timestamp.microsSinceUnixEpoch)
  );
}

export function VerdictCard({ verdict, large = false }: { verdict: Verdict; large?: boolean }) {
  const risk = RISK_LABEL[verdict.riskLevel] ?? { en: verdict.riskLevel, zh: verdict.riskLevel };
  return (
    <article className={`verdict verdict--${verdict.riskLevel} ${large ? 'verdict--large' : ''}`}>
      <header className="verdict__header">
        <span className="verdict__badge">
          {risk.zh} · {risk.en}
        </span>
        <span className="verdict__app">{verdict.appName}</span>
      </header>
      <p className="verdict__text" lang="zh">
        {verdict.explanationZh}
      </p>
      <p className="verdict__text" lang="en">
        {verdict.explanationEn}
      </p>
      {verdict.reasons.length > 0 && (
        <details className="verdict__reasons" open={large}>
          <summary>原因 · Why</summary>
          <ul>
            {verdict.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </details>
      )}
      <footer className="verdict__time">{formatTime(verdict)}</footer>
    </article>
  );
}
