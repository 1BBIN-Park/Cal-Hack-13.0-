# SecondLook · 多看一眼

**Cal Hacks 13.0 · Anthony**

#### Intentional Boundaries
> Family gets visibility, not control — no interception, no blocking.
> The rules decide the risk. Claude only explains it.

Chinese-American elderly immigrants get pushed, through text messages and WhatsApp, into
installing fake crypto-trading apps. They can't tell the app is a scam until the money is gone.

SecondLook (多看一眼, "take one more look") lets an elder check a suspicious **app (APK) or link** before installing or paying.
The design: a **rules engine** decides the risk from static-analysis signals, **Claude** explains
the verdict in plain Chinese and English, and a **paired family member** sees the same warning
live on their own phone. For links, the whole loop is live and tested on two real phones;
uploading an APK from the app is not tested yet (see [Status](#status)).

- Live demo site: https://2ndlook.us (backup: https://scam-app-check.netlify.app; needs the analysis service running; see
  [Status](#status))
- Build notes and the bugs we caught along the way: [`docs/build-journal.md`](docs/build-journal.md)

## How it works

```
 Elder's phone (web, Android later)              Analysis service (Python, Sophia)
 ─────────────────────────────────              ──────────────────────────────────
 paste a scam SMS / pick an APK  ── HTTPS ──►   static analysis + URL/redirect checks
 link extracted on-device:                      rules engine decides the risk
   look-alike letters, user@host,               Claude writes the 中文 + EN explanation
   Chinese domains → punycode                   (live for links; APK path untested)
                                                           │
                                                           │ report_verdict (HTTP reducer call,
                                                           ▼  only the service's identity allowed)
                                              ┌─────────────────────────────┐
                                              │ SpacetimeDB (Maincloud)     │
                                              │ verdict table, live         │
                                              └──────────┬──────────────────┘
                                   subscription          │          subscription
                              (filtered by pairing code) │
                     ┌───────────────────────────────────┴─────────────────┐
                     ▼                                                     ▼
            Elder's screen: big warning                     Family screen: live alert feed
            in their language                                (view-only by design)
```

1. **Pair:** the elder's phone makes a 6-character code; the relative types it in. The code is the
   only identity (no accounts).
2. **Check:** the elder picks an APK, or pastes a link or the whole scam text message.
3. **Decide** (Sophia's analysis service, [`py/app.py`](py/app.py)): a rules engine scores
   signals that [`py/analyze_apk.py`](py/analyze_apk.py) extracts (permissions, signing-certificate
   hash, wallet-like strings, a WebView-shell heuristic); for links, it follows redirects without
   downloading anything and checks the final domain, look-alike brands and urgent wording.
   **Claude never decides the risk**; it only explains the findings.
4. **Alert:** the verdict is written to SpacetimeDB once, and every phone paired to that code gets it
   through a subscription to the same query (tested on two real phones with the live site, and
   with two live subscribers in the smoke test).

## SpacetimeDB's role

SpacetimeDB is our whole real-time backend:
- **Database + live sync:** the `verdict` table; every paired phone subscribes to its pairing code's
  verdicts. No polling and no WebSocket/push server of our own.
- **One write path:** the Python service calls the `report_verdict` reducer over plain HTTP.
- **Security in the database:** `report_verdict` only accepts the analysis service's identity. The
  database owner authorizes it at runtime (`set_service_identity`), so no identity is hardcoded in
  this public repo and it can be rotated without redeploying. Everyone else gets HTTP 530.
- **Reconnection:** the SDK reconnects on its own; tested by killing the server mid-session.

Module: [`spacetimedb/src/index.ts`](spacetimedb/src/index.ts).

## Claude's role, and where it could go wrong

Claude (Haiku) writes the explanation for each verdict in Chinese and English, from the rules'
findings only. One language is shown per phone, with a 中文/English toggle. Cards already
label the two halves: "AI explanation (Claude)" vs "Found by rules". Known risks for the people
using it:
- Claude may **soften a warning** or **mistranslate urgency**, which matters a lot for elders.
- The **pasted SMS text is sent** to our analysis service, which uses it for the rules (urgent
  wording). Real messages can contain names, phone numbers or codes. Claude gets only the rules'
  findings (risk level and reasons, which can include the link's domain), not the message.
- Rule reasons are currently **English only**.
- **Seen in testing:** on low-risk links Claude wrote "This link appears to be safe" / "看起来是
  安全的", when the rules only found no warning signs, and it called an unreachable link "a minor
  issue". Mitigated: Claude's instructions now forbid "safe" / "安全" (one low-risk test passed); the
  fixed "What to do" line is the backstop. The card's own "What to do" line is fixed text and says
  low risk is not a guarantee.

The rules' findings are shown next to Claude's text, and Claude never sets the risk level, so a
softened sentence can't turn a high-risk verdict into a low one.

## Status

| Part | State |
|---|---|
| Web app: pairing, elder Scan screen, family feed, 中文/English toggle | Built, tested |
| SpacetimeDB module + identity lock, live on Maincloud | Built, tested |
| Link extraction (phishing tricks, Chinese domains) | Built, 39 regression cases |
| Static APK feature extraction ([`py/analyze_apk.py`](py/analyze_apk.py)) | In repo; Sophia reports tested on 3 samples |
| Analysis service: rules engine + Claude + `report_verdict` ([`py/app.py`](py/app.py)) | Live for links, tested end to end on two real phones; APK upload from the app **not tested yet** (Sophia) |
| Android share-target app | Planned (Phase 2) |

Early verdicts in testing were sent by hand with `curl`; since Saturday evening, verdicts come
from the analysis service.

## Run it locally

Prerequisites: Node 20+, the [SpacetimeDB CLI](https://spacetimedb.com/install).

```bash
npm install
(cd spacetimedb && npm install)                   # the module has its own dependencies
spacetime start                                   # local server on :3000
spacetime publish --server local --module-path spacetimedb -y scamguard-7xwfd
npm run dev                                       # http://localhost:5173
```

The feed stays empty until a verdict is written: `report_verdict` rejects every caller until the
database owner authorizes the analysis service's identity
(`spacetime call --server local scamguard-7xwfd set_service_identity <hex>`; see
[`docs/report-verdict-spike.md`](docs/report-verdict-spike.md)). Copy `.env.example` to
`.env.local` to point the app at another database or at the analysis service
(`VITE_ANALYSIS_URL`). The analysis service is [`py/app.py`](py/app.py) (Flask; Sophia).

Tests:
```bash
scripts/smoke-test.sh    # end-to-end: publish, identity lock, HTTP reducer call, 2 live subscribers
scripts/test-links.sh    # 39 link-extraction cases (strings only, nothing is fetched)
```

## Repo layout

| Path | What |
|---|---|
| `src/` | React web app (screens, verdict card, link extraction `links.ts`, i18n) |
| `spacetimedb/` | SpacetimeDB module: `verdict` table, `report_verdict`, identity lock |
| `py/` | Static analysis (Sophia) |
| `scripts/` | Smoke test and link tests |
| `docs/` | Build journal, `report_verdict` integration notes |
| `HACK.md` | Team plan: scope, locked decisions, status log |

## Disclosures

- **AI tools:** Claude (Anthropic) explains verdicts in the product. We used Claude
  Code while building: to write and review code, run tests and draft docs. A Claude Code review
  subagent checked Anthony's commits before they landed.
- **Libraries/APIs/hosting:** SpacetimeDB (Maincloud), React, Vite, esbuild, TypeScript, Node.js,
  Python, androguard, Flask, Anthropic Python SDK, ngrok, Netlify.
- **Test data:** test verdicts sent with `curl`; phishing messages from real scam reports (shared
  by Sophia) used as text only, never opened. Any APK samples are analyzed statically, never
  installed, and APK files are never committed. Samples: one synthetic scam-pattern APK built by our
  team to show real scam-app patterns (WebView-only shell, hardcoded wallet addresses,
  SMS-reading permission), not live malware, plus two benign comparison apps, the open-source F-Droid apps
  [Notes](https://f-droid.org/en/packages/org.billthefarmer.notes/) and
  [BMI Calculator](https://f-droid.org/en/packages/com.github.characterdog.bmicalculator/).
- **Limitations:** the verdict table is publicly readable so relatives can subscribe; anyone with
  the database name could read all sessions' verdicts. A production version needs per-session
  access control. Small sample set, so accuracy numbers are indicative only.
