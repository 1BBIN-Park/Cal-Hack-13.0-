# Next session: start here

Handoff written Sat 13:20 (Anthony's Claude session) so a fresh session can pick up without the
old conversation. Read this, then `HACK.md` (plan, locked decisions, status log) and
`docs/build-journal.md` (what happened and why). Update or delete this file once it's stale.

## Deadlines (Cal Hacks 13.0 hacker guide)
- **Devpost submission: Sun 9:00 AM**, no late entries. Guide recommends a draft by Sat night.
- **Judging: Sun 10:30-12:30** at an assigned table (given shortly after 9:00). Whole team must be
  present in person; 2-minute pitch + **live demo**. (Our inference, not in the guide: rehearsal
  between 9:00 and 10:30 is fine, but the Devpost entry can't change after 9:00. Confirm with
  organizers if it matters.)
- Venue Wi-Fi is untrusted: plan a phone hotspot and a recorded backup demo video.

## Sophia's checkpoint plan (Slack, Sat 12:14, relayed)
| Time | Sophia | Status |
|---|---|---|
| done | Static analysis (permissions, cert hash, URLs/wallets, WebView shell), tested on 3 samples | done (her report; `py/analyze_apk.py` is in the repo) |
| done | Rules scoring engine (risk_level + reasons) | done (her report; NOT in the repo yet) |
| 1:30 PM | Claude (Haiku) explanation layer, bilingual EN/ZH | pending |
| **6:00 PM hard** | Her service matches `/analyze` + `/analyze-url`; verdicts flow via `report_verdict` | pending |
| 8:00 PM | Correlation graph data (shared certs/domains) as nodes/edges | pending |
| 8:00 PM | Precision/recall on test samples | pending |
| 10:00 PM | Pitch narrative draft | pending |

**Shared checkpoint, 6:00 PM:** the full loop once, end to end: share a file/link → analysis →
score → Claude explanation → second device. If it isn't working by 6 PM, stop adding features and
both work on that one loop. Core build done ~10-10:30 PM, sleep until ~4 AM, then polish and
rehearse.

### Anthony's items from her list, mapped to reality
| Her item | Real status |
|---|---|
| SpacetimeDB sync | Done (local + Maincloud + a real phone) |
| Pairing flow UI | Done (`src/screens/Pairing.tsx`) |
| Banner UI consuming real verdict data | Built (`src/components/VerdictCard.tsx` reads risk_level, explanation_en/zh, reasons); untested with *real* pipeline output |
| Web upload fallback | Done (Scan screen: APK upload + link/SMS paste) |
| Wire Scan screen to her service | **Blocked on her HTTPS service URL** |
| Scan entry via Android share sheet | Web side ready (`/elder?session=…#text=…`); the Kotlin app is NOT built. HACK.md Phase 2 says start only after the web loop works |
| Correlation graph visualization | **STRETCH on the HACK.md cut list.** Only after the 6 PM loop works; her data arrives ~8 PM |

## What to do next, in order
1. **Finish and commit the README + Devpost draft** (uncommitted on disk; see "Unfinished" below).
2. **When Sophia sends her service URL** (must be HTTPS; a page served over HTTPS can't call http):
   set `VITE_ANALYSIS_URL`, run the real loop on two devices (paste the fake-Fidelity SMS on the
   elder screen → verdict + Claude text on the family screen), rebuild and redeploy the Netlify
   site (see "Live infrastructure" for the exact build), log it in the journal.
3. Remove "not live yet" markers in README / Devpost / journal only once step 2 really works.
4. If the loop works by 6 PM: correlation graph (stretch) when her data arrives, or the Android app.
5. Before 9 AM Sunday: delete the old open test DB `scamguard-test-311c81` (ask Anthony first; it
   can't be undone), make the repo public (only the burned SpacetimeDB token is in history as far
   as a pattern search shows; run a real scanner like gitleaks first), submit Devpost,
   pitch prep (`/hack-pitch`), backup demo video, `/hack-ship` checklist.

## How to work in this repo (rules that worked)
- **Pull first, every turn** (`git pull --rebase --autostash`), and again before committing.
  Sophia pushes to `main`, sometimes through the GitHub website.
- **`plan-reviewer` before every commit** (CLAUDE.md). Give it the staged diff, the facts it can't
  see (test results, what Sophia said), and the proposed commit message. Fix blockers, re-review,
  show Anthony the verdict. It has caught many real bugs; disagree out loud when it's wrong.
- **Commit message change note**: What / Why / Files / Locked decisions affected.
- **Protected files** (`HACK.md`, `CLAUDE.md`, `.claude/`, `spacetimedb/`): edit with the Edit or
  Write tool only (Anthony approves each); never via Bash. Add a HACK.md status line after each task.
- **Ownership**: Sophia owns `py/`, detection, the Claude prompt, eval numbers, pitch narrative.
  Anthony owns `src/`, pairing, the SpacetimeDB module/client, graph, demo polish. Things she said
  on Slack are "relayed by Anthony" until she writes them in the repo herself.
- **Honesty**: never claim something works until it's tested. Mark planned work "not live yet".
  The HACK.md Honesty list is what we disclose in the demo.

## Agents (`.claude/agents/`)
- **plan-reviewer**: independent check before every commit or plan change (above).
- **smoke-test**: runs `scripts/smoke-test.sh` (17 checks: build, bindings, local publish, identity
  lock, HTTP `report_verdict`, two live subscribers, impostors rejected). Use after any change to
  `spacetimedb/`, `src/module_bindings/` or subscription code. You can also run the script directly.
- **presentation-notes**: after each notable bug fix, security catch, design decision or feature,
  give it the commit hash + short facts; it appends to `docs/build-journal.md` by track.
- Use a separate agent (in a git worktree) only for independent parallel work, e.g. the Android
  app. Don't hand ordinary tasks to a "builder" agent: it loses context and costs more.

## Testing toolbox
- `scripts/smoke-test.sh`: database path end to end (local server only).
- `scripts/test-links.sh`: 39 link-extraction cases (strings only, never fetched).
- `node node_modules/typescript/bin/tsc -b`, and `node node_modules/vite/bin/vite.js build`.
  Don't use `npm run …` on this machine: a stray `~/node_modules/node` breaks npm scripts.
- Browser checks: the previous session used `puppeteer-core` with the installed Chrome from a
  scratchpad folder (screenshots at 375px, a mock analysis service). Those scripts weren't kept;
  rebuild a small one if needed.

## Live infrastructure
- Permanent site: https://scam-app-check.netlify.app (Anthony's Netlify account). Deploy = build
  a folder, Anthony drags it onto the site's **Deploys** page. Build it outside the repo:
  ```
  OUT=/tmp/netlify-dist   # any folder outside the repo
  VITE_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com \
  VITE_SPACETIMEDB_DB_NAME=scamguard-demo-158734 \
  VITE_ANALYSIS_URL=https://<sophia-service>   \
    node node_modules/vite/bin/vite.js build --outDir "$OUT" --emptyOutDir
  echo '/* /index.html 200' > "$OUT/_redirects"   # deep links /elder, /family
  ```
  Check the bundle contains the demo DB name before handing it over.
- Demo DB: `scamguard-demo-158734` on Maincloud, locked: only Sophia's new identity may call
  `report_verdict` (authorized with `spacetime call --no-config --server maincloud -y <db>
  set_service_identity <hex>`). Never authorize the burned identity from `py/.env` history.
- Local dev: `spacetime start` + dev DB `scamguard-7xwfd`; Vite on :5173.

## Unfinished at handoff
Both files below are **untracked** (never committed): `git clean` or a reset would delete them,
and if Sophia pushes her own README.md, `git pull` will refuse until ours is moved aside.

**README.md** (untracked; live/planned fixes applied, not yet re-reviewed). Still to do:
- Sophia to confirm the "How it works" step 3, the Status rows and the disclosures (her area),
  and whether APK samples are real scam apps or self-built scam-pattern samples.
- Status table: her report says the rules engine is done and tested; update the rows once that
  is in the repo.

**docs/devpost-draft.md** (untracked; reviewer findings NOT yet applied). Fix before committing:
- Mark as [NOT LIVE YET], or reword until the loop works: the tagline "Rules decide the risk;
  Claude explains it"; "The Python analysis service writes a verdict with one HTTP call…";
  Accomplishments "Rules decide, Claude explains…" (point it at the labeled UI only).
- "The live two-phone sync works on real phones" is not on record (one real phone + Node
  subscribers were tested). Reword, or run a two-phone test and log it.
- "a separate review agent checking every commit before it landed": change to "a Claude Code
  review subagent checked Anthony's commits before they landed" (Sophia's web commits weren't).
- Remove unsourced claims ("a named target", "often isolated") or cite a source (FBI IC3, FTC,
  news); Sophia owns this narrative.
- Add a "Where Claude could go wrong" line (softened warnings, mistranslated urgency): Anthropic
  criterion 4. Add "small sample set, accuracy indicative only" and "rule reasons English-only"
  to Disclosures.
- Demo link wording: say "a link that starts with 'apple.com'" (it's `аpple.com-verify.top`).
- Name the Claude model as Haiku (Sophia's plan).

## Open questions for Sophia
- Her HTTPS service URL and when it'll be up (needed for the 6 PM loop).
- Real-person story + a sourced statistic for the Anthropic track and the Devpost.
- OK to enter "Best People-First Hack" and "Best Security Hack"?
- OK with one language per phone in the demo (中文 elder phone, English family phone)?
- Correlation graph: confirm it stays a stretch goal after the 6 PM loop.
