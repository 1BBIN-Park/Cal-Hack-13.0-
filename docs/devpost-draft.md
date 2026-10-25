# Devpost draft (for Sophia + Anthony to edit, then paste into Devpost)

Status markers in [brackets] are notes to us; remove them before submitting. Anything marked
[NOT LIVE YET] must be either finished or reworded before Sun 9:00 AM.

**Project name:** SecondLook · 多看一眼

**Tagline:** Check a suspicious app or link before you install or pay, and your family sees the
warning live. Rules decide the risk; Claude explains it in 中文 and English.

**Tracks:** Anthropic · Spacetime · Best People-First Hack · Best Security Hack (Armadin) · Best
Beginner Hack · Best Use of Gen AI (MLH) [+ Meta "Bringing People Closer Together with AI": Sophia
to decide]

---

## Inspiration
Chinese-American elderly immigrants get pushed into "investment app" scams: a friendly text or
WhatsApp message leads to a fake crypto-trading app installed from a link (sideloaded, outside
the app store). They can't tell the app is a scam until the money is gone.

Americans 60 and older reported $4.88 billion in losses to the FBI's Internet Crime Complaint
Center in 2024, up 43% from 2023 and the most of any age group; investment fraud alone took $1.83 billion, often through fictitious crypto
platforms and trading apps. A growing number of these cases are "pig butchering": scammers build
trust online or through messaging apps, then steer victims to fake crypto investments
([InvestmentNews, Apr 2025](https://www.investmentnews.com/ria-news/elder-fraud-complaints-surge-past-48-billion-as-investment-scams-lead-losses/260273), citing the FBI's 2024 Internet Crime Report).
This problem is personal for us. A friend of Sophia's mother, in China, spent a month messaging
someone claiming to be a U.S. serviceman online before he asked her to wire money. This pattern,
often run out of scam compounds in Myanmar, has drawn global attention. Sophia has seen news
coverage of elderly victims being stopped by police at bank counters mid-transfer, and she got a
scam call herself the day she wrote this. Her mother now sends her every suspicious link or app
before clicking. Most people her generation don't have that safety net. SecondLook tries to
give them one. [Sophia: OK this edit of your story]

## What it does
- **Pair two phones** with a 6-character code: the elder's phone and a family member's. No accounts.
- **Check before installing or paying:** the elder picks an APK, or pastes a link, or pastes the
  whole scam text message. We pull the real link out of it, including tricks scammers use:
  look-alike letters (`аpple` written with a Cyrillic "а"), `bank.com@evil.top`, Chinese domains,
  full-width text, links broken across lines.
- **A rules engine decides the risk** from real static-analysis signals: dangerous permissions,
  signing certificate, hardcoded crypto wallet addresses, apps that are just a web page in a
  wrapper; for links, redirects and the final domain. [APK upload from the app: NOT TESTED YET]
- **Claude explains** the verdict in plain Chinese and English, labeled as AI on every card, next
  to the rules' actual findings.
- **The family phone gets the same warning live.** View-only by design: elders keep their autonomy.

## How we built it
- **SpacetimeDB** is the whole real-time backend. Verdicts are written with one HTTP call to the
  `report_verdict` reducer; every phone paired to a code subscribes to that code's verdicts and
  updates live: the Python analysis service makes that call, and we tested it on two real
  phones (plus two live subscribers in our smoke test). The reducer only accepts the analysis
  service's identity, which the
  database owner authorizes at runtime, so no identity sits in our public repo. The SDK handles
  reconnection; we tested it by killing the server mid-session.
- **React + TypeScript (Vite)** web app: pairing, the elder's check screen, the family feed, a
  中文/English toggle per phone, large text and touch targets for older users.
- **Python + androguard** static analysis of APKs; APK samples are analyzed, never installed.
- **Claude Haiku (Anthropic)** writes the explanation from the rules' findings.
- **Process:** we used Claude Code to write and test code; a Claude Code review subagent checked
  Anthony's commits before they landed. It caught several bugs (below). We kept a build journal
  of them.

## Challenges we ran into
- **Phishing links fight back.** Our first link extractor checked the wrong site for
  `https://bank.com@evil.top` (a browser opens evil.top), for `https://www.icbc.com中国.evil.top`
  (a phone opens evil.top, we checked the real bank), and for an IP-address link. We rebuilt it so
  the browser's own URL parser decides the host, and wrote 39 regression cases.
- **A pasted message silently changed the domain.** A single-line text box strips line breaks, so
  "Visit https://evil.top." + "click to confirm" became `evil.top.click`. Real scam texts copied
  from a screenshot (iPhone Live Text) also split links across lines.
- **We caught a leaked credential mid-hackathon.** A token was committed through the GitHub
  website, which skips `.gitignore`. We treated it as burned, re-minted it, and redesigned the
  database lock so no identity is hardcoded in the repo.

## Accomplishments that we're proud of
- Live sync over SpacetimeDB Maincloud: a verdict sent to the database showed up on a real phone's
  family screen, and on two live subscribers at once in our smoke test. [Run and log a real
  two-phone test before claiming "two phones".]
- The "look-alike" demo: a link that starts with "apple.com" (really `аpple.com-verify.top`, with
  a Cyrillic "а") shows up as "Will check: https://xn--pple-43d…", the domain it really is.
- No black-box verdicts for a vulnerable group: cards label "AI explanation (Claude)" apart
  from "Found by rules".

## What we learned
- Real-time sync doesn't need a custom backend; putting the security rule inside the database
  reducer kept the whole write path to one check.
- Phishing defense is mostly about agreeing with what the browser or phone will actually open.
- An independent reviewer (even an automated one) catches the bugs the author is blind to.

## Where Claude could go wrong
Claude may soften a warning or mistranslate urgency, and for an elder reading in Chinese that
can be the difference between stopping and paying. That's why Claude never decides the risk: the
rules' findings are shown next to its explanation, so a softened sentence can't hide a
high-risk verdict.

We saw it happen in testing: for low-risk links, Claude wrote "This link appears to be safe" /
"看起来是安全的", when the rules had only found no warning signs, and it called a link it couldn't
reach "a minor issue". A scam site that's been taken down looks exactly like that. So the card's
"What to do" line is fixed text chosen by the rules, not by Claude, and for low risk it says
"this doesn't guarantee it's safe". [Update once Sophia's prompt fix lands.]

## What's next
- Android share-sheet app: share a suspicious text or APK straight from WhatsApp/Messages
  (the web side is already ready for it).
- Both parents covered: today one pairing code is one household feed. Next, a family phone can
  follow several codes, with each alert labeled ("Mom", "Dad").
- Vietnamese and Spanish, for communities hit by the same scams (needs Claude explanations in
  those languages).
- Per-family access control on verdicts; a larger labeled sample set for accuracy numbers.

## Built with
SpacetimeDB · TypeScript · React · Vite · Python · androguard · Flask · Claude (Anthropic) · ngrok · Netlify ·
Claude Code

## Disclosures
- Claude Code was used to help write, test and review code and docs.
- Early test verdicts were sent by hand with `curl`, before the pipeline was live.
- Phishing messages from real scam reports (shared by Sophia) were used as text only, never opened.
- APK samples: one synthetic scam-pattern sample built by our team to show real scam-app
  patterns (WebView-only shell, hardcoded wallet addresses, SMS-reading permission), not live
  malware, plus two benign comparison apps, the open-source F-Droid apps
  [Notes](https://f-droid.org/en/packages/org.billthefarmer.notes/) and
  [BMI Calculator](https://f-droid.org/en/packages/com.github.characterdog.bmicalculator/).
- The verdict table is publicly readable (hackathon limitation).
- Pasted SMS text is sent to our analysis service for the rules (urgent wording). Claude gets only
  the rules' findings (risk level and reasons, which can include the link's domain), not the message.
- Small sample set, so accuracy numbers are indicative only.
- Rule reasons are English-only for now; Claude's explanation comes in both languages.

**Links:** repo [make public before submitting] · live site https://scam-app-check.netlify.app ·
demo video [TBD]
