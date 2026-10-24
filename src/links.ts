// Pull the link out of a pasted message (often a whole scam SMS) and turn it
// into the form the analysis service should check. The service decides risk;
// this only finds the link and shows the user exactly what will be checked.
// The URL parser, not a regex, decides the host, so tricks like
// "bank.com@evil.top" resolve to the host a browser would really open.

// Chinese-script top-level domains scammers can register (`https://银行.中国`).
const CJK_TLDS = ['我爱你', '新加坡', '中国', '中國', '公司', '网络', '網絡', '在线', '网址', '网店', '商城', '集团', '香港', '台湾', '台灣'];
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const isCjk = (ch: string) => CJK.test(ch);

// Where the host part ends: whitespace, path/query/fragment, or punctuation
// that can't be in a host. Non-ASCII punctuation (，、）。etc.) ends it too.
const AUTHORITY_STOP = /[\s/?#,;!()<>"'{}|\\^`[\]]|[^\x00-\x7F](?<=\p{P})/u;
// Path stays ASCII, so Chinese text glued after a link isn't swallowed.
const PATH = /^[/?#][A-Za-z0-9\-._~:/?#[\]@!$&*+;=%]*/;
const BARE = /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}\b(\/[A-Za-z0-9\-._~:/?#[\]@!$&*+;=%]*)?/i;
const TRAILING_PUNCT = /[.,;:!?)\]]+$/;

export type ExtractedLink = {
  url: string; // what gets sent: parsed + normalized (punycode, lowercase host, no user:pass@)
  written: string; // how it appeared in the message (after full-width normalization)
  hostDiffers: boolean; // the host as written isn't the host as parsed (non-Latin letters, user@host, trimmed text…)
};

// Trim the host where the link really ends, the way a phone's link detector
// does (Android keeps CJK letters inside host labels). Text that switches
// script inside the LAST label ("evil.top下载") is surrounding text and is cut.
// If more dotted labels follow ("icbc.com中国.evil.top"), a tap opens the
// whole thing, so keep it all and let the URL parser decide (→ …evil.top).
function cutHost(raw: string): string {
  const labels = raw.split('.');
  const last = labels.length - 1;
  const chars = [...labels[last]];
  let k = 1;
  while (k < chars.length && isCjk(chars[k]) === isCjk(chars[k - 1])) k++;
  labels[last] = chars.slice(0, k).join('');
  while (labels.length > 1 && labels[labels.length - 1] === '') labels.pop();
  // A trailing all-CJK label is a CJK TLD (trimmed to it) or surrounding text
  // after a Latin host.
  const tail = labels[labels.length - 1];
  if (labels.length > 1 && isCjk([...tail][0] ?? '') && !CJK_TLDS.includes(tail)) {
    const tld = CJK_TLDS.find(t => tail.startsWith(t));
    if (tld) labels[labels.length - 1] = tld;
    else if (!isCjk([...labels[labels.length - 2]].pop() ?? '')) labels.pop();
  }
  return labels.join('.');
}

// `asWritten` is the link's original text (before any trimming), so the
// preview shows it whenever what we check differs from what the message says.
function parse(candidate: string, asWritten = candidate): ExtractedLink | null {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // Must look like a real host: a dotted name or an IPv4 address.
    if (!url.hostname.includes('.')) return null;
    const writtenHost = asWritten
      .replace(/^https?:\/\//i, '')
      .split(/[/?#]/)[0]
      .toLowerCase()
      .replace(url.protocol === 'https:' ? /:443$/ : /:80$/, '');
    // What a browser opens never includes user:pass@, which only disguises it.
    url.username = '';
    url.password = '';
    return { url: url.href, written: asWritten, hostDiffers: writtenHost !== url.host };
  } catch {
    return null;
  }
}

export function extractLink(input: string): ExtractedLink | null {
  // Cap the work on huge pastes (the join regex is quadratic on junk input).
  // NFKC turns full-width tricks (ｈｔｔｐｓ：／／ｆａｋｅ．ｔｏｐ) into plain ASCII.
  let text = input.slice(0, 4000).normalize('NFKC');
  // Text copied out of a screenshot (iPhone Live Text) keeps the visual line
  // breaks, splitting links like "https://fideitly-\nintenrational.top/\n...".
  // Rejoin only when the next line itself looks like URL text (lowercase start
  // and a connector, or nothing else on the line), so "https://evil.top.\nclick
  // to confirm" stays evil.top and a following sentence isn't glued on.
  for (let prev = ''; prev !== text; ) {
    prev = text;
    text = text.replace(
      /([Hh][Tt][Tt][Pp][Ss]?:\/\/\S*[-/.?=&])[ \t]*\r?\n[ \t]*(?=[a-z0-9]\S*(?:[-/.?=&]|[ \t]*(?:\r?\n|$)))/,
      '$1'
    );
  }
  // "。" is a dot when a lowercase label follows (中国银行。com, fake-bank。com),
  // as a browser would read it. Before a capital ("…evil.top。Please confirm")
  // it's treated as a sentence end. 1:1 replacement, so offsets match `original`
  // and the preview can show the "。" as it was written.
  const original = text;
  text = text.replace(/(?<=[\p{L}\p{N}-])。(?=[a-z0-9])/gu, '.');

  const scheme = text.match(/https?:\/\//i);
  if (scheme) {
    // With a scheme in the message, never fall back to guessing a bare domain
    // (that turned "http://192.168.1.10/app.apk" into "app.apk").
    const rest = text.slice(scheme.index! + scheme[0].length);
    const stop = rest.search(AUTHORITY_STOP);
    const authority = stop === -1 ? rest : rest.slice(0, stop);
    const at = authority.lastIndexOf('@');
    const userinfo = at === -1 ? '' : authority.slice(0, at + 1);
    const hostPort = authority.slice(at + 1);
    const port = hostPort.match(/:\d{1,5}$/)?.[0] ?? '';
    const rawHost = port ? hostPort.slice(0, -port.length) : hostPort;
    const host = cutHost(rawHost).replace(TRAILING_PUNCT, '');
    if (!host) return null;
    const path = (rest.slice(authority.length).match(PATH)?.[0] ?? '').replace(TRAILING_PUNCT, '');
    const start = scheme.index! + scheme[0].length;
    const end = start + authority.length;
    const asWritten = `${scheme[0]}${original.slice(start, end).replace(TRAILING_PUNCT, '')}${original.slice(end, end + path.length)}`;
    // Keep the path only if the host wasn't cut short by surrounding text.
    const keepPath = host === rawHost.replace(TRAILING_PUNCT, '');
    return parse(`${scheme[0]}${userinfo}${host}${port}${keepPath ? path : ''}`, asWritten);
  }

  // No scheme: only ASCII hosts, since a Unicode host can't be told apart from
  // the Chinese words around it ("请登录中国银行.com").
  const bare = text.match(BARE);
  return bare ? parse(`https://${bare[0]}`) : null;
}
