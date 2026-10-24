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
1. Elder uploads a suspicious APK (web app; share sheet and link input proposed as cuts, see below)
2. The rules engine scores it and returns structured reasons
3. Claude turns those reasons into a bilingual warning banner on the elder's screen
4. The paired relative's device shows the same alert live through SpacetimeDB (view-only)

Done means: the demo shows an APK upload on device A producing a bilingual warning, and that warning appearing live on device B, end to end.

## Verdict contract (agree on this before building; changes need both people)
```
table verdict {
  id: u64 (primary key, auto_inc)
  session_id: string        // from pairing code
  app_name: string
  risk_level: string        // "low" | "medium" | "high"
  reasons: string[]         // from rule engine; exact format TBD with Sophia
  explanation_en: string    // Claude
  explanation_zh: string    // Claude
  created_at: Timestamp
}
reducer report_verdict(...)  // called by Sophia's pipeline
```

## Cut list
Items marked PROPOSED are Anthony's suggestions, not agreed yet. Sophia: confirm or push back.
- PROPOSED: Native Android share sheet. A native Android app is too much for 2 people. Web upload instead; PWA share_target is a stretch goal.
- PROPOSED: Link input. Analyzing a link means downloading a live scam APK. Stretch goal: domain-only checks on a pasted link.
- Login/accounts: a pairing code is the only identity
- Remote blocking by the relative: alerts are view-only by design
- iOS: out of scope, mention it as a limitation
- Correlation graph: STRETCH. Build it only after the two-device sync is reliable.

## Stack
- SpacetimeDB (`spacetime dev --template react-ts`): realtime sync with no custom backend
- Detection: <Sophia's choice, e.g. Python + androguard>
- Claude API (Haiku), server-side only, key in `.env`, never in the client
- Riskiest integration: Sophia's pipeline calling `report_verdict` (SDK or HTTP API). Spike result: pending.

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

## Pitch
- One-liner: <Product> helps Chinese-American elders and their families catch sideloaded scam apps by explaining real static-analysis red flags in plain EN/中文 and alerting family instantly.
- Roles: device A <TBD>, device B Anthony, narrator <TBD>, tech answers <TBD>, backup <TBD>

## Status log
- 20:00 Fri Anthony: Wrote plan from Sophia's doc. PROPOSED cuts: share sheet, link input; graph as stretch. NEXT: Sophia reviews the cuts + verdict contract, then spike pipeline → report_verdict → family view.
