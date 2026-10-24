# Build journal

True notes on notable bugs, security catches, design decisions and features, written down as
they happen, for judging Q&A, the demo and Devpost. Maintained by the `presentation-notes` agent.
Times are commit times (Pacific) unless marked "(per status log)". Claims are only what the repo
or a recorded test shows; anything not live yet is marked.

## Tracks (from the Cal Hacks 13.0 hacker guide)
- **Anthropic** (targeted): 1) a named community, 2) a real problem you lived or heard from
  someone, 3) it works, one thing done well, 4) Claude does something that matters and you know
  where it could go wrong for the people using it.
- **Spacetime** (targeted): SpacetimeDB as the core real-time backend, not added on the side.
- **Best People-First Hack** (general prize; proposed, not yet agreed with Sophia).
- **Best Security Hack** (Armadin; criteria "coming soon"; proposed, not yet agreed).
- General judging: impact, quality, technical complexity, creativity. Live demo required.
  Devpost due Sunday 9:00 AM; judging 10:30-12:30 with a 2-minute pitch.

## Talking points by track

**Anthropic**
- Named community: Chinese-American elderly immigrants and their adult children.
- Rules decide the risk, Claude only explains it, and every verdict card says which part is
  which ("AI explanation (Claude)" vs "Found by rules"). Built and visible in the UI.
- Where Claude could go wrong is written down (HACK.md Honesty): mistranslated urgency, softened
  warnings. The pasted SMS going to Claude is disclosed too.
- Not live yet (Sat 11:18): the Claude call and Sophia's pipeline. Verdicts shown so far were
  sent by hand with curl. Planned: the full SMS goes to the rules + Claude so the explanation can
  name the manipulation (fake deadline, "reply Y" trick).
- Still needed for criterion 2: a real conversation with someone affected.

**Spacetime**
- SpacetimeDB is the whole sync layer: a plain HTTP call to the `report_verdict` reducer reaches
  both paired phones live, filtered by pairing code. Tested with curl, locally and on Maincloud,
  and on a real phone.
- Security inside the database: `report_verdict` only accepts the analysis service's identity,
  authorized at runtime by the DB owner (no identity in the public repo; rotate without
  redeploying). Smoke-tested, and live on the Maincloud demo DB.
- Auto-reconnect: tested by killing the local server mid-session; the banner showed, cleared, and
  live alerts resumed without a reload.
- Framing for judges (true, not "impossible without it"): SpacetimeDB gave us the database, the
  read/fan-out and push layer (no backend of ours for sync), reconnection (the SDK's, no code of
  ours), and an authenticated caller identity, so write-path auth is a ~10-line check inside the
  reducer instead of an auth service. Reads are public by design (Honesty list). The analysis
  service (Sophia's) is a separate server that writes the verdict.
- Demo line (not live yet: needs Sophia's hosted service): paste the scam SMS on the elder phone;
  after the analysis, the family phone in the judge's hand updates at the same moment the elder's
  does. "Both phones read it from the same SpacetimeDB subscription. No server of ours relays it."
- Permanent demo site: https://scam-app-check.netlify.app (locked demo DB on Maincloud).

**Technical complexity / quality / security**
- Link extraction handles real phishing tricks: Cyrillic look-alikes, `bank.com@evil.top`,
  Chinese domains, full-width text, "。" as a dot, links split across lines. Several were real
  bugs found by testing or review (see log). Covered by 39 cases in `scripts/tests/links.test.ts`
  (run `scripts/test-links.sh`).
- From Fri 20:22 on, every commit made from Anthony's Claude sessions went through an independent
  review agent (`plan-reviewer`) first. It caught the bugs credited to it below. Commits made on
  the GitHub website (dfb7fcc, 92cf680, 2ec5840) weren't reviewed.

## Log

### Fri 22:43: Proved the riskiest integration first (Spacetime)
- **What:** Before building screens, tested pipeline → SpacetimeDB → live UI: a plain HTTP call to
  `report_verdict` and two live subscribers, filtered by session. No SDK needed on the pipeline side.
- **Why it matters:** de-risked the architecture in the first hours.
- **Evidence:** `docs/report-verdict-spike.md`, commit 2f82984.
- **Pitch line:** "The Python pipeline makes one HTTP call; every paired phone updates instantly."

### Sat 00:11: Hosted app working on a real phone (Spacetime)
- **What:** Web app on a temporary host + SpacetimeDB Maincloud; a curl-sent verdict appeared on a
  phone's family screen. Commit 3be144e.

### Sat ~00:30: Bug caught before commit: smoke test would hang forever
- **What:** The end-to-end smoke test used a bare `wait`, which also waits on the database server
  it starts, so it would never finish. The passing run hid it because a server was already up.
- **Found by:** the review agent.
- **Fix:** wait only on the subscriber processes. Re-run with no server running: it finished and
  left nothing listening (observed locally: about 14 seconds). Commit e2b3082.

### Sat 01:02 committed, 09:30 caught, 11:45 resolved: a real token was committed
- **What:** `py/.env` with a real SpacetimeDB token was created through the GitHub website, which
  skips `.gitignore` (commit dfb7fcc). The identity we were about to lock `report_verdict` to was
  that token's identity, so anyone with repo access could have posted fake verdicts.
- **Found by:** Anthony's Claude session, decoding the committed token locally (never printed) and
  comparing identities.
- **Fix:** treated the token as burned; the lock was designed so no identity is hardcoded in the
  repo (commit 3d1e523). Sophia (Slack, relayed by Anthony) re-minted her token and removed
  `py/.env` (2ec5840). The new identity was checked against all of git history: not present.
- **Pitch line:** "We caught a leaked credential mid-hackathon and built the lock so the repo
  can't leak it again."

### Sat 01:07: Design pass with real visual QA (quality, impact)
- **What:** Labeled AI vs rule findings, calmer cards, offline banner, invalid-code and empty
  states; checked with headless-Chrome screenshots at phone size, light and dark. Commit 0e54744.
- **Found by review:** the first offline-banner change removed the only warning when the
  connection dropped mid-session. Fixed, then tested by killing and restarting the local server.

### Sat 09:28: Identity lock on `report_verdict` (Spacetime, security)
- **What:** Private config table + owner-only `set_service_identity`; anonymous and other
  identities get HTTP 530. Smoke test grew to 17 checks, including impostors. Commit 3d1e523.
- **Also found:** `spacetime call` silently fell back to the dev database from the project
  config; every CLI call in the smoke test now uses `--no-config` (same commit).
- **Deployed later:** the locked demo DB on Maincloud with Sophia's new identity (logged in
  commit 61b8092). The old open test DB still exists until it is deleted (HACK.md Honesty).

### Sat 09:33: Real scam SMS became a test, and a fix
- **What:** Sophia's real phishing examples (fake Fidelity, fake NJ DMV). Copying the Fidelity link
  out of a screenshot with iPhone Live Text split it over 3 lines and we extracted only
  `https://fideitly-`. Now rejoined without gluing the next sentence on. Commit 4982bfb.
- **Found by review, before this commit:** the first version of the rejoin rule would have turned
  "https://evil.top." + a next line "click to confirm" into `evil.top.click`; the rule was
  tightened. (A second, separate path to the same wrong domain is the 10:01 entry.)
- **Pitch line:** "We tested on real scam texts, including the way an elder actually copies them."

### Sat 10:01: Bug caught: link field silently glued lines together
- **What:** A single-line `<input>` strips line breaks, so a pasted SMS could be checked as
  `evil.top.click`, the wrong domain.
- **Found by:** a browser test of the Android share prefill. Fixed with a textarea. Commit ca2d477.
  (Different cause from the 09:33 rejoin bug: here the browser itself removed the line break.)

### Sat 10:54: Look-alike and Unicode link tricks (technical complexity)
- **What:** Chinese domains (`中国银行.com`, `.中国`), full-width `ｈｔｔｐｓ`, `。` used as a dot and
  Cyrillic look-alikes (`аpple`) were missed or mangled, found when Anthony asked about Chinese
  links and we tested them. Now the URL parser decides the host and we send punycode (`аpple` →
  `xn--pple-43d`); the preview shows both forms. Commit 5c57a1f.
- **Bugs caught by review, each would have checked the wrong site:**
  - `https://bank.com@evil.top`: we checked bank.com; a browser opens evil.top.
  - `http://192.168.1.10/app.apk`: we checked a made-up domain, `app.apk`.
  - `https://www.icbc.com中国.evil.top`: we checked the real bank; a phone opens evil.top.
  - `evil.top。Please confirm`: silently became `evil.top.please`.
- **Evidence:** `scripts/tests/links.test.ts`.
- **Demo moment:** paste "https://аpple.com-verify.top". It looks like apple.com, but the screen
  shows "Will check: https://xn--pple-43d…".

### Sat 11:18: Full SMS sent to the analyzer (Anthropic, planned use)
- **What:** `/analyze-url` gets the whole pasted message as optional `message`, so Sophia's rules
  can score the sender, urgency and "reply Y" trick and Claude can explain them, once her service
  is live. Disclosed in HACK.md Honesty. Commit 61b8092.
