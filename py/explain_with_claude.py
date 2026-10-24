"""
Claude explanation layer for Cal Hacks scam-app detector.
Reads analysis_output/scored_results.json (produced by score_apps.py) and uses
Claude (Haiku) to turn each app's structured "reasons" into a plain-language,
bilingual (EN + ZH) warning banner. Claude does NOT decide risk — the rules
engine already did that. Claude's only job here is translation/explanation.

Setup:
    pip3 install anthropic python-dotenv --break-system-packages
    Add to your .env:  ANTHROPIC_API_KEY=sk-ant-...

Usage:
    python3 explain_with_claude.py
    (reads analysis_output/scored_results.json,
     writes analysis_output/verdicts.json  <- this is what feeds the SpacetimeDB schema)
"""

import json
import os
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv
from anthropic import Anthropic

load_dotenv()

INPUT_PATH = Path("analysis_output/scored_results.json")
OUTPUT_PATH = Path("analysis_output/verdicts.json")

MODEL = "claude-haiku-5-5"  # fast + cheap, plenty for this translation task

SYSTEM_PROMPT = """You explain Android app security warnings to non-technical \
elderly users and their family members. You are given a risk level and a list \
of technical reasons a security scanner flagged an app. Your job is ONLY to \
translate these into a clear, calm, non-alarming explanation — you do NOT \
decide or change the risk level, and you do NOT invent new reasons beyond \
what's given.

Rules:
- Write at a reading level appropriate for a non-technical older adult.
- Be direct about the risk without being alarmist or using scare tactics.
- Do not use technical jargon (no "permissions", "WebView", "certificate hash", etc.) \
  — describe what it means in plain terms instead.
- Keep each explanation to 2-3 short sentences.
- Output ONLY valid JSON with exactly these four keys: "explanation_en", "explanation_zh" \
  (Simplified Chinese), "explanation_es" (Spanish), and "explanation_vi" (Vietnamese). \
  No markdown, no extra commentary, no code fences.
"""


def build_user_prompt(risk_level, reasons, subject_type="app"):
    reasons_text = "\n".join(f"- {r}" for r in reasons)
    subject_word = "link" if subject_type == "link" else "app"
    return f"""Risk level: {risk_level}
What was analyzed: a {subject_word} (refer to it as "this {subject_word}" in your explanation, not "this app" if it's a link).

Technical reasons flagged:
{reasons_text}

Write the explanation in all four languages now."""


def get_explanation(client, risk_level, reasons, subject_type="app"):
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=1200,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": build_user_prompt(risk_level, reasons, subject_type)}],
        )
        raw_text = response.content[0].text.strip()
        # Claude is instructed to return raw JSON, but strip code fences just in case.
        if raw_text.startswith("```"):
            raw_text = raw_text.strip("`")
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
        parsed = json.loads(raw_text)
        return {
            "explanation_en": parsed.get("explanation_en", ""),
            "explanation_zh": parsed.get("explanation_zh", ""),
            "explanation_es": parsed.get("explanation_es", ""),
            "explanation_vi": parsed.get("explanation_vi", ""),
        }
    except Exception as e:
        print(f"    [!] Claude call failed: {e}")
        return {
            "explanation_en": "We couldn't generate an explanation right now, but this app "
            f"was flagged as {risk_level} risk. Please be cautious.",
            "explanation_zh": f"我们暂时无法生成详细说明，但这个应用被标记为{risk_level}风险，请谨慎操作。",
            "explanation_es": "No pudimos generar una explicación en este momento, pero esta "
            f"aplicación fue marcada como riesgo {risk_level}. Por favor, tenga cuidado.",
            "explanation_vi": "Chúng tôi hiện không thể tạo lời giải thích, nhưng ứng dụng này "
            f"đã được đánh dấu là rủi ro {risk_level}. Vui lòng thận trọng.",
        }


def main():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not found in .env — add it before running this script.")
        return

    if not INPUT_PATH.exists():
        print(f"Input not found: {INPUT_PATH}")
        print("Run score_apps.py first to generate it.")
        return

    with open(INPUT_PATH) as f:
        scored_results = json.load(f)

    if not scored_results:
        print("No results to explain.")
        return

    client = Anthropic(api_key=api_key)

    verdicts = []
    for item in scored_results:
        print(f"[*] Getting explanation for {item['file']} (risk: {item['risk_level']}) ...")
        explanations = get_explanation(client, item["risk_level"], item["reasons"])

        verdict = {
            # session_id is a placeholder here — your teammate's app will set the
            # real pairing session_id when it calls report_verdict via SpacetimeDB.
            "session_id": "DEMO_SESSION_ID",
            "app_name": item["app_name"],
            "risk_level": item["risk_level"],
            "reasons": item["reasons"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        verdict.update(explanations)  # adds explanation_en/zh/es/vi
        verdicts.append(verdict)

    with open(OUTPUT_PATH, "w") as f:
        json.dump(verdicts, f, indent=2, ensure_ascii=False)

    print(f"\n[*] Wrote {OUTPUT_PATH}")
    print("\n--- Preview ---")
    for v in verdicts:
        print(f"\n{v['app_name']} ({v['risk_level']})")
        print(f"  EN: {v['explanation_en']}")
        print(f"  ZH: {v['explanation_zh']}")
        print(f"  ES: {v['explanation_es']}")
        print(f"  VI: {v['explanation_vi']}")


if __name__ == "__main__":
    main()