// Link-extraction regression cases: real scam-SMS shapes and every phishing
// trick found during the build (see docs/build-journal.md). Strings only:
// nothing here is ever fetched or opened.
// Run: scripts/test-links.sh
import { extractLink } from '../../src/links.ts';
const cases: [string, string, string | null][] = [
  ['Chinese domain (IDN)', '请登录 https://中国银行.com/login 验证', 'https://xn--fiqs8s856bruk.com/login'],
  ['Chinese TLD', '访问 https://银行.中国 领取', 'https://xn--jn2a72x.xn--fiqs8s/'],
  ['Chinese TLD glued text', '访问https://银行.中国领取奖励', 'https://xn--jn2a72x.xn--fiqs8s/'],
  ['fullwidth scheme/dots', '点击ｈｔｔｐｓ：／／ｆａｋｅ－ｂｉｎａｎｃｅ．ｔｏｐ／ｄｌ', 'https://fake-binance.top/dl'],
  ['ideographic full stop (bare)', '登录 www.fake-bank。com 验证', 'https://www.fake-bank.com/'],
  ['ideographic full stop (scheme+IDN)', 'https://中国银行。com/x', 'https://xn--fiqs8s856bruk.com/x'],
  ['。 ends sentence after link', '请点击 https://evil.top/x。谢谢', 'https://evil.top/x'],
  ['。 after bare host', '请点击 https://evil.top。谢谢', 'https://evil.top/'],
  ['punycode host', 'https://xn--fiqs8s.com/pay', 'https://xn--fiqs8s.com/pay'],
  ['Chinese path', 'https://bit.ly/下载app', 'https://bit.ly/'],
  ['percent-encoded path', 'https://evil.top/%E4%B8%8B%E8%BD%BD', 'https://evil.top/%E4%B8%8B%E8%BD%BD'],
  ['Cyrillic look-alike', 'https://аpple.com-verify.top/id', 'https://xn--pple-43d.com-verify.top/id'],
  ['IDN with Chinese glued after', '点击https://中国银行.com下载领取', 'https://xn--fiqs8s856bruk.com/'],
  ['userinfo trick @', 'Log in: https://bank.com@evil.top/x', 'https://evil.top/x'],
  ['userinfo with pass', 'https://user:pw@evil.top/x', 'https://evil.top/x'],
  ['IPv4 link', 'Download: http://192.168.1.10/app.apk', 'http://192.168.1.10/app.apk'],
  ['IPv4 with port', 'http://45.12.3.4:8080/a', 'http://45.12.3.4:8080/a'],
  ['ASCII then Chinese then dot (full host, like Android)', '请访问https://evil.top详见bank.com', 'CHECK_FULL'],
  ['ASCII host then Chinese then App.cn (full)', 'https://evil.top下载App.cn', 'CHECK_FULL'],
  ['ASCII host then Chinese, no dot after', 'https://evil.top下载领取', 'https://evil.top/'],
  ['fraction slash trick', 'https://bank.com⁄evil.top', null], // parser decides; checked separately below
  ['bank domain then CJK then evil (blocker)', 'https://www.icbc.com中国.evil.top/login', 'CHECK_EVIL'],
  ['bank+银行.evil.top', 'https://icbc.com银行.evil.top', 'CHECK_EVIL'],
  ['bank中国.evil.top', 'https://bank中国.evil.top', 'CHECK_EVIL'],
  ['。 then English sentence', '您的包裹https://evil.top。Please confirm', 'https://evil.top/'],
  ['。 in path then English', 'https://evil.top/x。Then reply', 'https://evil.top/x'],
  ['default port no noise', 'https://evil.top:443/x', 'https://evil.top/x'],
  ['Fidelity full SMS', 'Fidelity Investments Emergency Notice:\n\nhttps://fideitly-intenrational.top/securitycenter?XfA=Xk8Ks8\n\n(Reply Y)', 'https://fideitly-intenrational.top/securitycenter?XfA=Xk8Ks8'],
  ['Live Text 3 breaks', 'https://fideitly-\nintenrational.top/\nsecuritycenter?XfA=Xk8Ks8\n(Reply Y and reopen this', 'https://fideitly-intenrational.top/securitycenter?XfA=Xk8Ks8'],
  ['DMV', 'Pay Now:\n\nhttps://mvc.gov-lubj.cfd/pay\n\nPlease pay immediately', 'https://mvc.gov-lubj.cfd/pay'],
  ['Chinese glued (ASCII host)', '点击https://bit.ly/abc下载领取收益。', 'https://bit.ly/abc'],
  ['trailing punctuation', 'see https://evil.example/x).', 'https://evil.example/x'],
  ['comma after host', 'Go to https://evil.top, then log in', 'https://evil.top/'],
  ['period then lowercase line', 'Visit https://evil.top.\nclick to confirm', 'https://evil.top/'],
  ['bare domain', 'fake-coinbase.xyz', 'https://fake-coinbase.xyz/'],
  ['percent not a link', '年收益3.5%，稳赚', null],
  ['plain text', 'hello there', null],
  ['uppercase scheme', 'HTTPS://fideitly-\nintenrational.top/\nsecuritycenter?XfA=Xk8Ks8', 'https://fideitly-intenrational.top/securitycenter?XfA=Xk8Ks8'],
  ['fullwidth comma after link', '链接https://evil.top/x，请尽快', 'https://evil.top/x'],
];
let fails = 0;
for (const [name, input, want] of cases) {
  const got = extractLink(input);
  if (want === 'CHECK_EVIL' || want === 'CHECK_FULL') {
    const host = got ? new URL(got.url).hostname : '';
    const ok = want === 'CHECK_EVIL' ? host.endsWith('.evil.top') && got!.hostDiffers : !!got && host.includes('xn--') && got.hostDiffers;
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(36)} ${got?.url} hostDiffers=${got?.hostDiffers}`);
    continue;
  }
  if (name === 'fraction slash trick') {
    const ok = !!got && got.url.includes('xn--') && got.hostDiffers;
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(36)} ${got?.url} (host as browser sees it; written shown)`);
    continue;
  }
  const ok = (got?.url ?? null) === want && !(name === 'default port no noise' && got!.hostDiffers);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(36)} ${got ? got.url : 'null'}${got?.hostDiffers ? '  [shows written: ' + got.written + ']' : ''}${ok ? '' : '   want ' + want}`);
}
for (const n of [4000]) { const junk = ['中'.repeat(n), ('中国.').repeat(n/3), 'https://'+'中-'.repeat(n/2), 'http://'.repeat(n/7)]; for (const j of junk) { const t0=Date.now(); extractLink(j); const ms=Date.now()-t0; if (ms>1000) { fails++; console.log('SLOW (speed check, catastrophic backtracking guard)', ms, 'ms'); } } }
{ const g = extractLink('https://中国银行。com/x'); const ok = !!g && g.hostDiffers && g.written.includes('。'); if (!ok) fails++; console.log(`${ok?'PASS':'FAIL'}  。-mapped host shows original 。 in preview: ${g?.written}`); }
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exitCode = fails ? 1 : 0;
