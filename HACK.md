# HACK.md

> Shared plan for the team. Every calhacks-kit skill reads and updates this file.
> Keep it short. If it no longer fits on one screen, the scope is too big.

## Event
- Event: Cal Hacks 13.0, Palace of Fine Arts, SF (Oct 23-25, 2026)
- Submission deadline: Devpost by **Sun 9:00 AM** (no late entries). Guide recommends a draft by Sat night.
- Judging: Sun 10:30-12:30 at our assigned table; whole team must be present; 2-minute pitch + LIVE demo.
- Judging criteria: impact, quality, technical complexity, creativity (guide)
- Rules to respect: project started at the event; MLH Code of Conduct; disclose libraries, APIs, AI tools, test data
- Tracks we target (exact criteria from the Cal Hacks 13.0 hacker guide):
  - Anthropic: 1) a named community, 2) a real problem you lived or heard from someone, 3) it
    works, one thing done well, 4) Claude does something that matters and we know where it could
    go wrong for the people using it. Prize: $5,000 Claude credits + 1Y Claude Max 20x.
  - Spacetime: SpacetimeDB as the core real-time backend (live shared state, instant sync),
    meaningfully used, not added on the side. Prizes: $2,048 / $1,024 / $512.
  - AGREED (Sophia, Slack Sat ~13:50, relayed): general "Best People-First Hack"; "Best Security
    Hack" (Armadin, criteria TBA). Best Beginner Hack: ELIGIBLE (confirmed by Anthony, Sat ~19:00).
    Best Use of Gen AI (MLH): agreed (Sophia, Slack ~18:15, relayed). Meta "Bringing People Closer
    Together with AI": Sophia to decide.
  - Both: public GitHub repo required (repo is currently PRIVATE, so make it public before submitting)

## Team
| Name | Strengths | Owns |
|------|-----------|------|
| Sophia | security, detection logic | static analysis, rule scorer, sample APKs, Claude prompt, eval numbers, pitch narrative |
| Anthony | UX/UI, frontend | 3 screens, pairing flow, SpacetimeDB schema + reducer + client sync, graph view, demo polish |

## Problem
- One sentence: Chinese-American elderly immigrants get pushed through text messages, WhatsApp and
  similar apps into sideloading fake crypto-trading apps, and they can't tell those apps are scams
  until the money is gone.
- The user: an elderly Chinese-speaking immigrant who gets a text/WhatsApp link to an "investment app",
  plus their adult child who would step in if they knew.
- Why it matters: money and personal info lost, sometimes escalating to physical harm; victims are
  often isolated from family during the scam. <add a number or news story>
- What's different: rule-based static analysis decides the risk, Claude only explains it (EN/中文),
  and a paired family member sees the warning live.

## MVP: the one journey
1. Elder shares a suspicious APK or link to our Android app (Phase 2), or uploads/pastes it in the web app (Phase 1, and the permanent fallback). Links get URL/redirect analysis only; APK analysis runs only on files we already have.
2. The rules engine scores it and returns structured reasons
3. Claude turns those reasons into a bilingual warning banner on the elder's screen
4. The paired relative's device shows the same alert live through SpacetimeDB (view-only)

Done means: the demo shows an APK upload on device A producing a bilingual warning, and that warning appearing live on device B, end to end.

## Locked decisions (change only with both people's OK)
Every Claude session: if a change would contradict a row here, stop and ask the human.
| Decision | Why | Agreed |
|---|---|---|
| Rules engine decides risk; Claude only writes the EN/中文 explanation | Reliable, explainable verdicts; core of the Anthropic pitch | Sophia (her plan) |
| Relative's view is view-only, no remote blocking | Elder autonomy; keeps scope small | Sophia (her plan) |
| Verdict contract below | UI and pipeline both depend on it | Sophia (relayed by Anthony) + Anthony (Fri 22:45) |
| Android app never talks to SpacetimeDB directly; only TS (web) and the analysis service do | No official Kotlin SDK | PENDING Sophia |
| Web upload stays working as the fallback, even after the Android app ships | Demo can't depend on the riskiest piece | Sophia (relayed by Anthony) + Anthony (Fri 23:12) |
| Links get URL/redirect analysis only; never auto-download an APK from a live link | Safety/liability on stage | Sophia (relayed by Anthony) + Anthony (Fri 23:12) |
| No APKs in git; scam samples are statically analyzed only, never installed | Safety; repo goes public | PENDING Sophia |

## Verdict contract (AGREED Fri 22:45; changes need both people)
```
table verdict {
  id: u64 (primary key, auto_inc)
  session_id: string        // from pairing code
  app_name: string
  risk_level: string        // "low" | "medium" | "high"
  reasons: string[]         // from rule engine
  explanation_en: string    // Claude
  explanation_zh: string    // Claude
  timestamp: Timestamp      // set inside the reducer from ctx.timestamp, not passed by caller
}
reducer report_verdict(...)  // called by Sophia's pipeline
  // rejects callers whose identity isn't the analysis service's (token from POST /v1/identity).
  // Sophia OK'd locking to her identity (Slack, Sat 00:54, relayed by Anthony).
  // Design (Anthony; Sophia OK'd it on Slack Sat ~11:45, relayed): private config table; the
  // publisher is the DB owner and authorizes her identity via set_service_identity(hex) (no hex
  // in the public repo); until then her calls get HTTP 530.
```

## Cut list
Items marked PROPOSED are Anthony's suggestions, not agreed yet. Sophia: confirm or push back.
- PWA share target: dropped in favor of the native Android app (Phase 2). Both do the same job, so we picked one.
- Auto-downloading APKs from links: never. (Link input itself is back in: URL/redirect checks only, Fri 23:12.)
- Login/accounts: a pairing code is the only identity
- Remote blocking by the relative: alerts are view-only by design
- iOS: out of scope, mention it as a limitation
- Correlation graph: STRETCH. Build it only after the two-device sync is reliable.

## Phase 2: Android share-target app (Anthony's plan; Sophia confirmed on Slack Fri 23:00, relayed. Timeboxed)
- Owner: Anthony
- Thin Kotlin app, four jobs only:
  1. Pairing code entered once, saved in SharedPreferences
  2. Intent filters for ACTION_SEND (share sheet) and ACTION_VIEW (tapping an APK / "Open with",
     so we sit next to the package installer) on `application/vnd.android.package-archive`, plus a
     generic fallback (`application/octet-stream` or `*/*`) for file managers that send that instead.
     Confirm it's an APK by `.apk` extension or ZIP magic bytes. Also ACTION_SEND on `text/plain`
     for shared links (per Sophia's Slack, Fri 23:00).
  3. Upload the APK + session_id (multipart) to the analysis service over HTTPS. For shared text
     (an SMS), don't parse it in Kotlin: open the WebView at
     `/elder?session=<code>#text=<urlencoded shared text>` (a #fragment, so the SMS never reaches
     the web host's logs). The page extracts the link, shows "Will check: …", and the elder taps
     Check (built and tested Sat ~10:00). Only open it with a saved, valid pairing code. Encode
     the text with `Uri.encode(text)` (or a raw `&`, `#`, `+` in the SMS breaks it). Repeat
     shares into an already-open page work (hashchange).
  4. WebView opens the elder page `/elder?session=<code>`, which subscribes and shows the banner.
     Enable `setDomStorageEnabled(true)` and JavaScript on the WebView.
  No JS bridge, no Kotlin SpacetimeDB client.
- Networking: phones must reach THREE things over HTTPS/WSS: the React app (the WebView loads it),
  the analysis service, and SpacetimeDB. Hackathon Wi-Fi often blocks device-to-device traffic and
  Android blocks plain HTTP by default, so host them: React on Vercel/Netlify or a tunnel, SpacetimeDB
  on Maincloud, analysis service on a tunnel or host. Enable CORS on the analysis service for browser
  uploads. Test this tonight; the two-device web demo needs it too.
- Gates:
  - Start only after the web loop works end to end (target Sat ~10 AM)
  - Share → banner working on a real phone by Sat ~6 PM, or demo with web upload and pitch Android as next
  - Upload size limit on the service covers APKs from the app too

## Stack
- SpacetimeDB (`spacetime dev --template react-ts`): realtime sync with no custom backend
- Detection: <Sophia's choice, e.g. Python + androguard>
- Claude API (Haiku), server-side only, key in `.env`, never in the client
- Riskiest integration: Sophia's pipeline calling `report_verdict`. No Python SDK exists, so either
  HTTP API `POST /v1/database/<db>/call/report_verdict` (JSON array of args, Bearer token) or a
  small Node script using the TS SDK. Spike result: HTTP API works locally (see
  docs/report-verdict-spike.md); also works on Maincloud (Fri 23:31).
- Analysis service: set an upload size limit (APKs can be tens of MB).

Architecture:
```
elder web UI --upload--> analysis service (static analysis -> rules -> Claude)
                              |
                              v  report_verdict
                         SpacetimeDB verdict table
                          |                   |
                   elder banner        relative family view (subscribed by session_id)
```

## Honesty
Mocked, hardcoded, or seeded parts we will disclose in the demo:
- APK samples: ONE synthetic scam-pattern sample built by our team (not live malware) + two benign
  comparison apps (Sophia, Slack Sat ~13:56, relayed). The benign BMI calculator scores "medium"
  (WebView-shell flag): a known false positive.
- Small sample set, so precision/recall numbers are indicative only
- Claude may mistranslate urgency or soften a warning (known failure mode). SEEN Sat 18:55: on low
  verdicts it wrote "This link appears to be safe" / "看起来是安全的" (the rules only found no
  warning signs), and it called an unreachable link "a minor issue". Prompt fix pending (Sophia).
  Until then, don't demo a low verdict, or present it as the "where Claude goes wrong" moment.
- report_verdict is locked to the service identity in code (smoke-tested), but the existing test DB
  scamguard-test-311c81 predates the lock and still accepts anyone. The demo DB must be a fresh
  publish with the service authorized.
- Any verdicts shown before Sophia's pipeline is wired are hand-sent via curl. Say so if demoed.
- Demo DB holds test verdicts that can't be deleted (sessions TEST01, ZZZZZZ, WJDXYY). Never use
  those as demo pairing codes.
- Pasted SMS text is sent to the analysis service for scoring (urgent wording). Real messages can
  contain names, numbers or codes. Claude (Anthropic) gets only the rules' findings (risk level and
  reasons, which can include the link's domain), not the message (py/app.py at 1e9cb25). If that
  changes, update this line.
- Verdict table is public so relatives can subscribe; anyone with the DB name could read all
  sessions' verdicts. Hackathon limitation; production would need per-session access control.

## Pitch
- One-liner: SecondLook (多看一眼) helps Chinese-American elders and their families catch sideloaded scam apps by explaining real static-analysis red flags in plain EN/中文 and alerting family instantly.
- Roles: device A <TBD>, device B Anthony, narrator <TBD>, tech answers <TBD>, backup <TBD>

## Status log
- 20:00 Fri Anthony: Wrote plan from Sophia's doc. PROPOSED cuts: share sheet, link input; graph as stretch. NEXT: Sophia reviews the cuts + verdict contract, then spike pipeline → report_verdict → family view.
- 20:30 Fri Anthony: PROPOSED process: plan-reviewer subagent cross-checks every commit and plan
  change (rule in CLAUDE.md). Sophia: OK with this? Also folded in reviewer fixes: HTTP reducer path,
  reducer identity check, PWA limits, public-table limitation.
- 20:45 Fri Anthony: Android share-target app is back in scope as Phase 2 (timeboxed, web upload
  stays as fallback). Added Locked decisions, change notes, and edit-protection settings. Sophia:
  review the PENDING rows.
- 21:15 Fri Anthony: My "Anthony's Task Breakdown" doc differs from this plan in 4 places. Sophia, weigh in:
  1. Scan screen takes "a link or file". Link input is a PROPOSED cut; Anthony thinks Sophia may
     have a low-risk way to do it (e.g. domain-only checks, no APK download). Sophia: describe it
     and we'll un-cut it if safe. Until then the Scan screen does file upload only.
  2. "Share-target entry point": PWA share target is cut; web gets an upload button, share target
     moves to the Phase 2 Android app (pending Sophia).
  3. ~10 hrs for static screens is too long for a web loop by Sat ~10 AM; screens stay quick.
  4. No report_verdict spike or hosting in the breakdown. Plan calls the spike the riskiest piece
     and says to test hosting tonight, so both go first.
  NEXT: scaffold `spacetimedb/` (CLI installing) with verdict table as DRAFT, report_verdict spike
  + hosting check, then 3 static screens.
- 21:45 Fri Anthony: Scaffolded react-ts client + TS module (CLI 2.13). verdict table +
  report_verdict are DRAFT with NO identity check yet, so default publish target is local; any
  Maincloud DB before the check is a throwaway. Reviewer: comparing `ctx.sender.toHexString()` to a
  hardcoded hex works for the check. Sophia: OK? NEXT: report_verdict spike + hosting, then screens.
- 22:15 Fri Anthony: report_verdict spike WORKS locally over plain HTTP (no SDK needed); two live
  subscribers got the verdict instantly, filtered by session. Sophia: copy the curl call (Python
  equivalent untested) from docs/report-verdict-spike.md. NEXT: hosting check, then screens.
- 22:45 Fri Anthony: Sophia agreed the verdict contract, relayed by Anthony (session_id, app_name,
  risk_level, reasons[], explanation_en, explanation_zh, timestamp). Renamed created_at ->
  timestamp, dropped DRAFT notes. Reducer args unchanged; timestamp is set by the reducer, not
  sent. Sophia: ack here. Identity check still PENDING.
- 23:00 Fri Anthony (logged 23:15): Sophia (Slack, relayed): no SMS reading; entry point is the Android share
  sheet, channel-agnostic (link or APK from any app). Demo story: text-message scam. So Phase 2
  share target is confirmed by Sophia. Asked her on Slack, no reply yet: (1) how links get
  analyzed (decides if link input is un-cut), (2) keep web upload fallback? Anthony decided: drop
  WeChat, story is text messages/WhatsApp/etc. (matches Sophia's demo framing).
  NEXT: 3 web screens (Scan = file upload; link field off until Sophia answers 1).
- 23:15 Fri Anthony: Sophia answered (Slack, relayed). (1) Links: follow redirects, analyze final
  URL/domain (age, typosquatting, hosting), NEVER download the APK; link field goes on the Scan
  screen. Two paths (URL, APK) feed the same verdict table. (2) Web fallback: keep it. Both added
  to Locked decisions. Built 3 web screens (Pairing, Scan, Family). Sophia: the Scan screen calls
  POST $VITE_ANALYSIS_URL/analyze (multipart: file, session_id) and /analyze-url (JSON: url,
  session_id). Rename to whatever your service uses. /analyze-url sends JSON, so the service
  must answer CORS preflight (OPTIONS). 23:24: Sophia confirmed the WeChat -> SMS/WhatsApp change
  to the Problem section (relayed by Anthony). Sophia: still ack the other relayed decisions above.
  NEXT: hosting check, Android share target.
- 23:25 Fri Anthony (hack-check): phase BUILD (deadline TBA, assumed Sun AM). Weakest: Functionality (no
  analysis service, Claude not called yet). NEXT: Sophia's minimal /analyze -> rules -> Claude ->
  report_verdict on one sample APK; Anthony: Maincloud + Vercel hosting check. Paste exact track
  requirements and the real deadline.
- 23:31 Fri Anthony: Maincloud works: throwaway DB scamguard-test-311c81 (open writes; delete
  before the demo and before the repo goes public). HTTPS report_verdict 200, live WSS sync to 2
  Node subscribers (web app not yet tested on Maincloud). Each POST /v1/identity mints a new
  identity, so Sophia: mint the service token on Maincloud and we hardcode that hex.
  NEXT: host the web app (Vercel, env vars set) and open it on a phone.
- 00:09 Sat Anthony: Hosting check PASSED (temporary Netlify Drop host, not in repo) on a real
  phone -> Maincloud test DB (its name is now in a public bundle; still delete before demo). A
  curl-sent verdict appeared on the phone's Family screen (no-refresh not yet confirmed).
  Vercel auto-deploy from GitHub needs the repo owner (1BBIN-Park) to install the Vercel app
  (Anthony has push, not admin); workaround: deploy from Anthony's own Vercel account by CLI or
  drag-and-drop. NEXT: Sophia's /analyze -> report_verdict; identity check; long-lived host;
  then Android Phase 2.
- 00:30 Sat Anthony: Added `scripts/smoke-test.sh` (local-only end-to-end check: typecheck,
  bindings fresh, publish, HTTP report_verdict, 2 live subscribers, session filter) and a
  `smoke-test` subagent that runs it. Passes now. Run it after touching spacetimedb/ or bindings.
  NEXT: identity check (needs Sophia's Maincloud identity); wire Scan to Sophia's service.
- 03:00 Sat Anthony (logged 09:30, Claude while Anthony was away): design pass: verdict card labels
  "AI explanation (Claude)" vs "Found by rules", offline banner with auto-reconnect, invalid-code
  and empty states. Verified with 375px/dark screenshots, 12/12 UI flow test, drop/reconnect test.
- 09:30 Sat Anthony: SECURITY: py/.env with a real SPACETIME_TOKEN was committed (dfb7fcc). The
  identity Sophia sent (c200f486…03f6) belongs to that token, so it is BURNED and must never be
  authorized. Sophia: mint a new token, keep it only locally, remove py/.env, send the new hex.
  Built the identity lock (Sophia OK'd locking; the config table + owner-only
  set_service_identity design is Anthony's PROPOSAL, Sophia: please ack). Smoke test now 17
  checks incl. impostor/anonymous rejection. Sophia confirmed endpoints (/analyze, /analyze-url)
  and will handle CORS (Slack, relayed). NEXT: fresh Maincloud demo DB once new hex arrives;
  wire Scan to Sophia's service.
- 10:00 Sat Anthony: Scan link field: rejoins links split across lines (Live Text copies of real
  scam SMS), now a textarea (an <input> stripped line breaks and could glue "evil.top." onto
  "click"), and accepts #text=<shared SMS> for the Android app (prefill only, elder taps Check).
  Sophia: lowercase URLs in /analyze-url (HTTPS://… can arrive uppercase).
- 10:45 Sat Anthony: UI now shows ONE language per device with a 中文/English toggle (remembered
  per phone; Claude still writes both explanations, contract unchanged). Demo: set the elder
  phone to 中文, the family phone to English, so both languages still show. Rule reasons are
  English-only. Sophia: OK for the pitch? (MVP text says "bilingual warning" on device A.)
- 11:15 Sat Anthony: Link extraction (src/links.ts) handles Chinese/Unicode tricks: Chinese
  domains and TLDs (中国银行.com, 银行.中国), full-width ｈｔｔｐｓ, "。" used as a dot, and Cyrillic
  look-alikes (аpple), user@host tricks (bank.com@evil.top → evil.top) and IP links. The URL
  parser decides the host; `url` is sent NORMALIZED: punycode (аpple → xn--pple-43d), lowercase
  host, user:pass@ removed, trailing / on bare hosts. The preview shows the written form when it
  differs; the UI makes no risk call. Sophia: a mixed-script / look-alike host rule would catch
  the аpple trick.
- 11:45 Sat Anthony: Sophia (Slack, relayed) re-minted her token (new identity not in git
  history, checked), removed py/.env, OK'd the owner-authorizes design, will lowercase URLs, and
  agreed to an optional message field. Published locked demo DB scamguard-demo-158734 on Maincloud
  and authorized her identity (anonymous + other identities get 530, checked). Endpoint now:
  POST /analyze-url JSON {url, session_id, message?}; message = the whole pasted text (≤4000
  chars, client-side cap only), omitted when the paste is nothing but the link. Privacy: in
  Honesty. Sophia: please don't log the message body (request/debug logs, error traces). Old
  open test DB scamguard-test-311c81 still exists (phone preview); delete before demo / going
  public. NEXT: wire Scan to Sophia's live service.
- 12:15 Sat Anthony: Event section filled from the official hacker guide (deadline Sun 9:00 AM,
  judging 10:30-12:30, exact Anthropic + Spacetime criteria; People-First + Security PROPOSED).
  Added docs/build-journal.md (true talking points by track + log of bugs/catches) kept by a new
  presentation-notes agent, and the 39 link cases as scripts/test-links.sh. Anthropic gap:
  criterion 2 needs a real conversation with someone affected. NEXT: Sophia's service live.
- 12:45 Sat Anthony: Permanent site live: https://scam-app-check.netlify.app (Netlify, Anthony's
  account; manual deploys from a local build). Points at the locked demo DB (empty until
  Sophia's pipeline writes). Final build needs Sophia's HTTPS service URL. Idea for future work
  (not now): Vietnamese/Spanish would need a verdict-contract change for Claude's explanations.
- 13:20 Sat Anthony: Sophia's checkpoint plan (Slack 12:14, relayed): Claude/Haiku layer by 1:30
  PM; her service on /analyze + /analyze-url writing via report_verdict by 6:00 PM (HARD); graph
  data + precision/recall by 8 PM; pitch draft by 10 PM. SHARED 6:00 PM CHECKPOINT: full loop
  once end to end, else stop features and fix the loop. Graph stays STRETCH (cut list). Handoff
  for a fresh session: docs/next-session.md (README + Devpost drafts still uncommitted there).
- 13:37 Sat Anthony: README + docs/devpost-draft.md committed (d99d137), review-approved. Claims
  limited to what's on record (one real phone + smoke-test subscribers; service and Claude marked
  not live). Sophia: fill Devpost Inspiration (real story + sourced stat), say whether APK samples
  are real scam apps, confirm README step 3 / Status / Disclosures. NEXT: Sophia's HTTPS service
  URL → real two-phone loop by 6 PM.
- 14:35 Sat Anthony: Sophia pushed the pipeline (py/app.py, score_apps.py, explain_with_claude.py;
  no secrets/APKs). One real verdict landed in the demo DB (fideitly…top, high, EN/ZH; checked by
  SQL). Her ngrok URL (shared on Slack; keep it out of the repo) was OFFLINE (ERR_NGROK_3200) at
  14:30, so the app → service loop is untested. Sent her (relayed by Anthony) fixes in her area:
  app.py reads `message_text` but the agreed endpoint (11:45 entry) says `message` (SMS dropped); upload filename
  path traversal; debug=True on a public URL; requests.get downloads link bodies (contradicts the
  no-auto-download decision); .gov/subdomain false positives. Docs now carry her sourced stat and
  sample disclosure; tracks agreed. Name: Anthony proposed SecondLook · 多看一眼, Sophia to answer.
  NEXT: tunnel back + fixes → two-phone loop → Netlify rebuild.
- 15:35 Sat Anthony: Name agreed: SecondLook · 多看一眼 (Sophia, Slack ~15:00, relayed); renamed
  in the UI (title, pairing hero), README and Devpost. Package/DB names unchanged. Sophia pushed
  her review fixes (61fadd9; checked in code: `message` read, fixed upload name, debug off,
  stream=True + private-IP block, allowlist, 20MB cap, Haiku 5.5). Benign samples confirmed as
  F-Droid open-source apps. Her service was unreachable at 15:30 (ngrok up, Flask down:
  ERR_NGROK_8012), so the loop is still untested. Small asks sent: unresolvable domains are
  reported as "private address"; redirect hops aren't checked before they're contacted.
  NEXT: service up → browser-style check → Netlify build → two-phone loop.
- 17:20 Sat Anthony: LOOP WORKS end to end, except Claude. Headless Chrome at 375px against
  the Netlify build, served locally (not real phones yet): elder (中文) pastes the Fidelity SMS →
  Sophia's service → rules → SpacetimeDB → elder + family (EN) cards, both ~5.3 s after Check;
  high risk, 4 reasons incl. urgency (so the `message` fix works). Claude FAILS server-side since
  her model swap to claude-haiku-5-5: fallback text on verdicts 2-3, and it's still labeled
  "AI explanation (Claude)". Sent to Sophia. Phone browsers get ngrok's interstitial on GET, so
  Scan now sends ngrok-skip-browser-warning (insurance; POSTs passed without it). Tracks per
  Sophia: Anthropic, Spacetime, People-First, Gen AI (MLH, qualifies), Beginner (eligibility
  unknown: ask organizers), Armadin maybe (no criteria yet). NEXT: Anthony deploys the build →
  real two-phone test; Sophia fixes Claude; keep "not live yet" on Claude until a real
  explanation comes through the loop.
- 18:05 Sat Anthony: New ux-critic agent ran a full local pass (throwaway DB + mock, nothing
  sent to Maincloud/Sophia). Applied its top fixes: the Claude label shows only over real Claude
  text (empty or canned fallback text is hidden); a fixed "下一步 / What to do" line by risk level
  (elder vs family wording, never Claude's); the card is titled by hostname; calm errors (no
  "Failed to fetch"); low = "未发现明显风险 / No warning signs found" + "not a guarantee"; h1 "检查
  应用或链接". Checked at 375px zh/en, light/dark. Sophia: please send "" when Claude fails, or
  keep the fallback prefixes "We couldn't generate" / "我们暂时无法生成" exactly as they are (the
  UI hides those). NEXT: Anthony deploys the rebuilt bundle → real two-phone test.
- 18:55 Sat Anthony: Live site serves the latest build (bundle checked: SecondLook, what-to-do,
  fallback check). Sophia pushed 1e9cb25: claude-haiku-4-5 again; the fallback is now "" (the
  card hides empty text). Demo DB verdicts 5-7 (session XBU6AP; sender unconfirmed, likely
  Anthony's phone on the live site, asking him) carry REAL Claude text from her service. If they
  came from the live site, the deployed loop works: confirm with the two-phone test.
  CLAUDE OVERCLAIMS: on low verdicts it writes "This link appears to be safe" / "看起来是安全的"
  (the rules only found no warning signs), and it calls an unreachable link "a minor issue". Sophia: tell Claude never to call anything safe and not to downplay
  unreachable links. This is our "where Claude goes wrong" story. Multi-parent: one code = one
  household feed today; following several codes is in Devpost "What's next". Android app: the
  HACK.md Phase 2 gate (Sat ~6 PM) has passed, so it's pitched as next unless both agree.
- 19:00 Sat Anthony: TWO-PHONE TEST PASSED (Anthony's report): two real phones paired on the
  live site (session XBU6AP); the checks (verdicts 5-7, real Claude text) showed on both.
  Removed the "not live yet" markers in README/Devpost/journal for the link path. Still NOT
  TESTED: APK upload from the app (the MVP "done means" names APK upload; decide with Sophia:
  test her synthetic APK from a phone, or demo the link path). Android app: no Android phone,
  so it's pitched as next, not built. Claude's "safe" overclaim added to README + Devpost.
