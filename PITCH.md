# SecondLook · 多看一眼: pitch

Format (hacker guide): Sun 10:30–12:30 at our table, 2-minute pitch + live demo, then judge Q&A.
Both of us at the table.

**Roles (agreed, Sat ~19:45)**
- Sophia: narrator; answers detection, rules, Claude and accuracy questions.
- Anthony: driver (both phones); answers SpacetimeDB, pairing and UI questions; holds the
  backup video and the hotspot, watches the time.

**Before judges arrive**
- Sophia's service running; laptop on the phone hotspot, not venue Wi-Fi.
- Use https://2ndlook.us and pair both phones there (pairings don't carry over from the
  Netlify address; if you fall back to it, re-pair there).
- Elder phone in 中文, family phone in English, both paired with a fresh code (never TEST01,
  ZZZZZZ, WJDXYY). Family phone unlocked on the family screen, brightness up, notifications off.
- This exact SMS (Sophia's real example, unedited) copied on the elder phone:
  ```
  Fidelity Investments Emergency Notice:

  https://fideitly-intenrational.top/securitycenter?XfA=Xk8Ks8

  (Reply Y)
  ```
- One dry run on both real phones right before judging: high risk and Claude's text appear on
  both. If Claude's section is missing (Claude failed), skip the "written by Claude" line.
- Backup video open on the laptop.

## 2-minute script

**Open (15s), Sophia**
"Last year, Americans over 60 reported $7.7 billion in losses to the FBI's Internet Crime
Complaint Center, up from $4.88 billion the year before. We built this for Chinese-speaking elders who get a
friendly text, then a link to a fake investment app. SecondLook, 多看一眼, means 'take one more
look'."

**Demo (70s)**
- Anthony (hands the family phone to the judge): "This is the son's or daughter's phone. It's
  paired with Grandma's phone using a six-letter code. No accounts."
- Anthony (elder phone, pastes the SMS): "This is a real scam text. Grandma pastes the whole
  message."
- Sophia: "We pull out the real link, even when it's split across lines the way it copies from a
  screenshot."
- Anthony taps 检查链接.
- Sophia (while it checks): "Our rules engine decides the risk: a Fidelity look-alike domain and a
  .top ending, which scam links use a lot."
- Card appears on both phones. Sophia: "High risk, on Grandma's phone in Chinese, and on your
  phone in English, live. The line under it tells her exactly what to do: don't tap, call family
  first."
- Sophia: "The explanation is written by Claude, and it's labeled as AI. The rules decide the
  risk; Claude only explains it."
- Honesty line, Sophia: "Our scam APK sample is one we built to copy real scam-app patterns,
  and our test set is small."

**Tech (20s), Anthony**
"No server of ours relays the alert: the analysis service writes one row to SpacetimeDB, and
both phones are subscribed to it. The database only accepts writes from our analysis service, so
nobody can write a fake verdict straight into it."

**Impact (15s), Sophia**
"We check the link itself, so it works even when the scam site is already gone. Next: an Android
share button, so Grandma can share a text straight from WhatsApp, and alerts for both parents."

## 30-second version (judge walks up late)
"SecondLook helps Chinese-speaking elders check a scam link before they tap it, and their
family sees the warning live." Paste the SMS, tap Check, hand over the family phone: "High risk,
in Chinese for her, in English for you. Rules decide, Claude explains."

## Q&A

1. **Who is the user, how do you know?** Chinese-speaking elderly immigrants and their adult
   children. Sophia: a friend of my mother's spent a month messaging a fake U.S. serviceman
   before he asked her to wire money; my mother now sends me every suspicious link first, and
   most people her generation don't have that safety net. People 60+ reported the most fraud losses of any
   age group in 2024 (FBI IC3, via InvestmentNews).
2. **What did you build vs use?** We built the link extraction, the rules engine, the
   SpacetimeDB module and identity lock, the screens and pairing. We used SpacetimeDB,
   androguard, the Claude API, React and Flask.
3. **What's mocked?** Nothing in the demo: a real scam text, replayed, through the real service,
   Claude and database. Limits: one synthetic scam APK sample plus two open-source comparison
   apps, a small test set, English-only rule reasons, APK upload from the app not tested yet, and
   we've seen Claude overstate safety.
4. **Hardest problem?** Agreeing with what the phone will actually open: `bank.com@evil.top`,
   Cyrillic look-alikes like `аpple`, Chinese domains, links split across lines. We let the URL
   parser decide the host and keep 39 regression tests.
5. **Different from Google Safe Browsing / antivirus?** They flag sites already on a blocklist,
   and a brand-new scam domain often isn't listed yet. We check the link itself (look-alike
   brands, suspicious endings, redirects), explain why in her language, and loop in her family.
6. **What breaks at 1,000 users?** The analysis service runs on one laptop behind a tunnel, and
   it's open: anyone with a code could send it a link. Production needs a real host, per-family
   auth on the service, and per-family access control on the verdict table (it's publicly
   readable today).
7. **Another week?** The Android share-sheet app, alerts from both parents on one family
   phone, more languages (Vietnamese, Spanish), and a bigger labeled test set.
8. **Tracks?**
   - Anthropic: a named community; Claude explains while the rules decide; we know where it
     goes wrong. We'd already made the "what to do" line fixed text from the rules; then we saw
     Claude call a low-risk link "safe", which showed why.
   - Spacetime: SpacetimeDB is the whole live layer, with security inside the reducer.
   - People-First, Security, Beginner, Gen AI: as entered on Devpost.

**Where Claude can go wrong (have this ready)**
It can soften a warning or overstate safety. We saw "this link appears to be safe" on a
low-risk link. That's why Claude never sets the risk, and the advice line isn't Claude's.
