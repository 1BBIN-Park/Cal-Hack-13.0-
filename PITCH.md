# SecondLook · 多看一眼: pitch

Format (hacker guide): Sun 10:30–12:30 at our table, 2-minute pitch + live demo, then judge Q&A.
Both of us at the table.

**Roles**
- Sophia: narrator; answers detection, rules, Claude and accuracy questions.
- Anthony: driver (both phones); answers SpacetimeDB, pairing and UI questions; holds the
  backup video and the hotspot, watches the time.

**Before judges arrive**
- Sophia's service running; laptop on the phone hotspot, not venue Wi-Fi.
- Elder phone in 中文, family phone in English, both paired with a fresh code (never TEST01,
  ZZZZZZ, WJDXYY). Family phone unlocked on the family screen, brightness up, notifications off.
- The fake-Fidelity SMS copied on the elder phone, ready to paste.
- Backup video open on the laptop.

## 2-minute script

**Open (15s), Sophia**
"Americans over 60 reported $4.88 billion in internet-fraud losses to the FBI last year, the
most of any age group. Our users are Chinese-speaking elders who get a friendly text, then a
link to a fake investment app. SecondLook, 多看一眼, means 'take one more look'."

**Demo (70s)**
- Anthony (hands the family phone to the judge): "This is the son's or daughter's phone. It's
  paired with Grandma's phone using a six-letter code. No accounts."
- Anthony (elder phone, pastes the SMS): "This is a real scam text. Grandma pastes the whole
  message."
- Sophia: "Notice the link was split across lines, the way it copies from a screenshot. We
  still pull out the real address."
- Anthony taps 检查链接.
- Sophia (while it checks): "Our rules engine decides the risk: a Fidelity look-alike domain, a
  .top ending, pressure wording."
- Card appears on both phones. Sophia: "High risk, on Grandma's phone in Chinese, and on your
  phone in English, at the same moment. The line under it tells her exactly what to do: don't
  tap, call family first."
- Sophia: "The explanation is written by Claude, and it's labeled as AI. The rules decide the
  risk; Claude only explains it."
- Honesty line, Sophia: "Our APK samples are ones we built to copy real scam apps, and our
  test set is small."

**Tech (20s), Anthony**
"There's no server of ours in the middle. The analysis service writes one row to SpacetimeDB,
and both phones are subscribed to it, so they update together. The database only accepts
writes from our analysis service's identity, so nobody can fake a warning."

**Impact (15s), Sophia**
"Scam links often disappear fast, so we judge the link itself, not just the site. Next: an Android
share button, so Grandma can share a text straight from WhatsApp, and alerts for both parents."

## 30-second version (judge walks up late)
"SecondLook helps Chinese-speaking elders check a scam link before they tap it, and their
family sees the warning live." Paste the SMS, tap Check, hand over the family phone: "High risk,
in Chinese for her, in English for you. Rules decide, Claude explains."

## Q&A

1. **Who is the user, how do you know?** Chinese-speaking elderly immigrants and their adult
   children. [Sophia: your real-person story.] Elders 60+ reported the most fraud losses of
   any age group in 2024 (FBI IC3, via InvestmentNews).
2. **What did you build vs use?** We built the link extraction, the rules engine, the
   SpacetimeDB module and identity lock, the screens and pairing. We used SpacetimeDB,
   androguard, the Claude API, React and Flask.
3. **What's mocked?** Nothing in the demo. The APK samples are synthetic, the sample set is
   small, and rule reasons are English-only.
4. **Hardest problem?** Agreeing with what the phone will actually open: `bank.com@evil.top`,
   Cyrillic look-alikes like `аpple`, Chinese domains, links split across lines. We let the URL
   parser decide the host and keep 39 regression tests.
5. **Different from Google Safe Browsing / antivirus?** They block known bad sites quietly. We
   explain why in the elder's own language, and the family sees the warning live.
6. **What breaks at 1,000 users?** The analysis service runs on one laptop behind a tunnel.
   Next it moves to a real host. The verdict table is also publicly readable, so it needs
   per-family access control.
7. **Another week?** The Android share-sheet app, alerts from both parents on one family
   phone, more languages (Vietnamese, Spanish), and a bigger labeled test set.
8. **Tracks?**
   - Anthropic: a named community; Claude explains while the rules decide; we know where it
     goes wrong. We saw it call a low-risk link "safe", so the "what to do" line is fixed text
     from the rules.
   - Spacetime: SpacetimeDB is the whole live layer, with security inside the reducer.
   - People-First, Security, Beginner, Gen AI: as entered on Devpost.

**Where Claude can go wrong (have this ready)**
It can soften a warning or overstate safety. We saw "this link appears to be safe" on a
low-risk link. That's why Claude never sets the risk, and the advice line isn't Claude's.
