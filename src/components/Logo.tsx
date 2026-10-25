// Brand mark: an eye (多看一眼, "take one more look") on a rounded tile.
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--brand-a)' }} />
          <stop offset="1" style={{ stopColor: 'var(--brand-b)' }} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#logo-bg)" />
      <path
        d="M8 24c4.5-7 9.8-10.5 16-10.5S35.5 17 40 24c-4.5 7-9.8 10.5-16 10.5S12.5 31 8 24z"
        fill="#fff"
      />
      <circle cx="24" cy="24" r="6.5" style={{ fill: 'var(--brand-a)' }} />
      <circle cx="26.2" cy="21.8" r="2.1" fill="#fff" />
    </svg>
  );
}

// Simple line icons for the two big choices on the start screen.
export function ShieldIcon() {
  return (
    <svg className="btn__icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </svg>
  );
}

export function FamilyIcon() {
  return (
    <svg className="btn__icon" viewBox="0 0 24 24" aria-hidden>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M2.5 20c.6-3.4 2.8-5.5 5.5-5.5s4.9 2.1 5.5 5.5" />
      <path d="M13.5 15.2c.9-.8 2.1-1.2 3.5-1.2 2.3 0 4 1.6 4.5 4.5" />
    </svg>
  );
}
