// A pairing code is the only identity (see HACK.md cut list: no logins).
// No 0/O/1/I so codes are easy to read aloud and type.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function newPairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every(c => ALPHABET.includes(c));
}

export type Role = 'elder' | 'family';

// Remembered per browser so a refresh doesn't lose the pairing.
// Storage can throw (private mode), so every access is guarded.
const STORAGE_KEY = 'pairing';

export function savePairing(role: Role, code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ role, code }));
  } catch {
    // Not fatal: the session code is also in the URL.
  }
}

export function loadPairing(): { role: Role; code: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPairing() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
