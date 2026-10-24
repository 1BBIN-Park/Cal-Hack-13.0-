# HACK.md

> Shared plan for the team. Every calhacks-kit skill reads and updates this file.
> Keep it short. If it no longer fits on one screen, the scope is too big.

## Event
- Event: Cal Hacks 13.0, Palace of Fine Arts, SF (Oct 23-25, 2026)
- Submission deadline: TBA. Check the Dashboard or Discord. Devpost is usually due BEFORE hacking ends.
- Judging: expo-style at our table, then finalists pitch on stage. Plan a 30s and a 2-3 min version.
- Judging criteria: Application, Functionality/Quality, Creativity, Technical Complexity
- Rules to respect: no code written before the event; disclose libraries, APIs, AI tools, and test data
- Tracks we target:
  - Anthropic "Claude for Public Benefit": <paste exact requirements>
  - SpacetimeDB Main Track: SpacetimeDB must be core functionality, not cosmetic. <paste exact requirements>
  - Both: public GitHub repo required (repo is currently PRIVATE, so make it public before submitting)

## Team
| Name | Strengths | Owns |
|------|-----------|------|
| Sophia | security, detection logic | static analysis, rule scorer, sample APKs, Claude prompt, eval numbers, pitch narrative |
| Anthony | UX/UI, frontend | 3 screens, pairing flow, SpacetimeDB schema + reducer + client sync, graph view, demo polish |

## Problem
- One sentence: Chinese-American elderly immigrants get pushed through WeChat messages into
  sideloading fake crypto-trading apps, and they can't tell those apps are scams until the money is gone.
- The user: an elderly Chinese-speaking immigrant who gets a WeChat link to an "investment app",
  plus their adult child who would step in if they knew.
- Why it matters: money and personal info lost, sometimes escalating to physical harm; victims are
  often isolated from family during the scam. <add a number or news story>
- What's different: rule-based static analysis decides the risk, Claude only explains it (EN/中文),
  and a paired family member sees the warning live.

## MVP: the one journey
1. Elder shares a suspicious APK to our Android app (Phase 2), or uploads it in the web app (Phase 1, and the permanent fallback)
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
| Web upload stays working as the fallback, even after the Android app ships | Demo can't depend on the riskiest piece | PENDING Sophia |
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
  // reject callers whose identity isn't the analysis service's (token from POST /v1/identity),
  // otherwise anyone who knows the DB name can insert fake verdicts.
  // PROPOSED (Anthony): hardcode the service identity hex in the module. Simplest; Sophia to confirm.
```

## Cut list
Items marked PROPOSED are Anthony's suggestions, not agreed yet. Sophia: confirm or push back.
- PWA share target: dropped in favor of the native Android app (Phase 2). Both do the same job, so we picked one.
- PROPOSED: Link input. Analyzing a link means downloading a live scam APK. Stretch goal: domain-only checks on a pasted link.
- Login/accounts: a pairing code is the only identity
- Remote blocking by the relative: alerts are view-only by design
- iOS: out of scope, mention it as a limitation
- Correlation graph: STRETCH. Build it only after the two-device sync is reliable.

## Phase 2: Android share-target app (Anthony's decision; Sophia to confirm. Timeboxed)
- Owner: Anthony
- Thin Kotlin app, four jobs only:
  1. Pairing code entered once, saved in SharedPreferences
  2. Intent filters for ACTION_SEND (share sheet) and ACTION_VIEW (tapping an APK / "Open with",
     so we sit next to the package installer) on `application/vnd.android.package-archive`, plus a
     generic fallback (`application/octet-stream` or `*/*`) for file managers that send that instead.
     Confirm it's an APK by `.apk` extension or ZIP magic bytes.
  3. Upload the APK + session_id (multipart) to the analysis service over HTTPS
  4. WebView opens the elder page `/elder?session=<code>`, which subscribes and shows the banner
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
  docs/report-verdict-spike.md); Maincloud still to test.
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
- Test APKs may be self-built "scam-pattern" samples, not real malware. Say which.
- Small sample set, so precision/recall numbers are indicative only
- Claude may mistranslate urgency or soften a warning (known failure mode)
- Verdict table is public so relatives can subscribe; anyone with the DB name could read all
  sessions' verdicts. Hackathon limitation; production would need per-session access control.

## Pitch
- One-liner: <Product> helps Chinese-American elders and their families catch sideloaded scam apps by explaining real static-analysis red flags in plain EN/中文 and alerting family instantly.
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
