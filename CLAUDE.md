# CLAUDE.md

Cal Hacks 13.0 project: scam app warning system (2 people, 36 hours).

## Read first
- `HACK.md` is the team plan: MVP journey, cut list, verdict contract, owners, status log.
  Read it before starting any task. Don't build anything on its cut list.

## Ownership
- Sophia: static analysis, rule scorer, sample APKs, Claude prompt, evaluation
- Anthony: UI screens, pairing flow, SpacetimeDB schema/reducer/client sync, graph view
- Don't edit the other person's area without asking. Propose changes in the HACK.md status log instead.
- The verdict contract in HACK.md is shared. Changes need both people.

## Rules
- Claude never decides risk. The rules engine does. Claude only writes the EN/中文 explanation.
- The Claude API key stays server-side in `.env`. Never put it in client code or commits.
- Never commit APK files. Only statically analyze scam samples; never install them.
- Subagents don't edit HACK.md or CLAUDE.md. The main session updates them.
- Before every commit, and before proposing any architecture or scope change, run the
  `plan-reviewer` subagent on the staged diff or plan. Fix its blockers before committing. Show the
  human its verdict. If you disagree with a finding, say so instead of silently ignoring it.
- After finishing a task: add a Status log line to HACK.md (time, name, what changed, NEXT), commit, push.

## Commands
- <fill in once scaffolded: dev server, spacetime publish, analysis script>
