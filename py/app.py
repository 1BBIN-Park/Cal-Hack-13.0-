"""
Flask API service for Cal Hacks scam-app detector.

Exposes:
  POST /analyze       (multipart: file, session_id) -> analyzes an APK
  POST /analyze-url    (JSON: url, session_id, message_text optional) -> analyzes a link

Both endpoints: run detection -> score -> get Claude explanation -> write a
verdict row to SpacetimeDB via report_verdict -> return the verdict as JSON.

Setup:
    pip3 install flask flask-cors requests python-dotenv anthropic androguard --break-system-packages

Run:
    python3 app.py
    (serves on http://127.0.0.1:8000 by default — matches VITE_ANALYSIS_URL in .env.example)

To make this reachable from a phone/teammate's app during the demo, expose it with ngrok:
    ngrok http 8000
    -> gives you a public https://xxxx.ngrok-free.app URL. Send that URL to your teammate.
"""

import os
import re
import difflib
import tempfile
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from anthropic import Anthropic

# Reuse the existing pipeline pieces — these modules only define functions at
# import time (their main() only runs when executed directly), so importing
# them here is safe and doesn't re-run anything.
from analyze_apk import analyze_single_apk
from score_apps import score_single_app, find_shared_certs, POINTS_HARDCODED_URL
from explain_with_claude import get_explanation, MODEL

load_dotenv()

app = Flask(__name__)
CORS(app)  # handles OPTIONS preflight automatically for the /analyze-url JSON endpoint

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
SPACETIME_TOKEN = os.getenv("SPACETIME_TOKEN")

# Per teammate (Sat 13:46): the actual demo DB on Maincloud is scamguard-demo-158734,
# not scamguard-7xwfd from .env.example — our identity is authorized there.
SPACETIMEDB_HOST = "https://maincloud.spacetimedb.com"
SPACETIMEDB_DB_NAME = os.getenv("VITE_SPACETIMEDB_DB_NAME", "scamguard-demo-158734")
REPORT_VERDICT_URL = f"{SPACETIMEDB_HOST}/v1/database/{SPACETIMEDB_DB_NAME}/call/report_verdict"

claude_client = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

# A small list of well-known brand names scam domains commonly impersonate.
# Not exhaustive — good enough for a hackathon demo.
KNOWN_BRANDS = [
    "fidelity", "chase", "bankofamerica", "wellsfargo", "paypal", "venmo",
    "apple", "amazon", "usps", "fedex", "ups", "irs", "dmv", "medicare",
    "socialsecurity", "santander", "coinbase", "binance",
]

# TLDs frequently abused in phishing campaigns (not inherently malicious on
# their own, but a useful weak signal combined with other factors).
SUSPICIOUS_TLDS = [".top", ".cfd", ".xyz", ".click", ".work", ".gq", ".tk", ".fit", ".loan"]


def normalize_url(raw_url):
    """Lowercase scheme/host, keep path/query case as-is (teammate's HTTPS://... ask)."""
    parts = urlsplit(raw_url.strip())
    normalized = parts._replace(scheme=parts.scheme.lower(), netloc=parts.netloc.lower())
    return urlunsplit(normalized)


def looks_like_typosquat(hostname):
    """Heuristic: domain either contains a known brand name outright, OR a
    domain label is a near-miss (close edit distance) of a brand name —
    catches letter-swap tricks like 'fideitly' for 'fidelity'. Not a
    rigorous check — good enough to flag obvious cases for a hackathon demo."""
    host_lower = hostname.lower()
    collapsed = host_lower.replace("-", "").replace(".", "")

    # Split hostname into dot-separated labels so we can fuzzy-compare each
    # label individually (e.g. "fideitly" from "fideitly-intenrational.top").
    labels = re.split(r"[.\-]", host_lower)

    for brand in KNOWN_BRANDS:
        # Case 1: brand name appears outright somewhere in the domain.
        if brand in collapsed:
            if not re.fullmatch(rf"(www\.)?{brand}\.(com|org|net)", host_lower):
                return True, brand
            continue

        # Case 2: a domain label is a near-miss of the brand name (typo/letter
        # swap) — e.g. "fideitly" vs "fidelity".
        for label in labels:
            if len(label) < 4:
                continue
            similarity = difflib.SequenceMatcher(None, label, brand).ratio()
            if similarity >= 0.75:
                return True, brand

    return False, None


def analyze_url_signals(url, message_text=None):
    """
    Returns (reasons: list[str], score: int) for a URL, using redirect-following
    + domain heuristics only. Does NOT download any file from the link.
    """
    reasons = []
    score = 0

    url = normalize_url(url)

    final_url = url
    try:
        resp = requests.get(url, allow_redirects=True, timeout=5)
        final_url = resp.url
        if final_url != url:
            reasons.append(f"Link redirects to a different address: {final_url}")
            score += 1
    except Exception:
        # If we can't reach it, that's fine — we still analyze the URL itself.
        reasons.append("Could not reach the link to follow redirects; analyzing the URL as given.")

    hostname = urlsplit(final_url).hostname or ""

    is_typosquat, brand = looks_like_typosquat(hostname)
    if is_typosquat:
        score += 3
        reasons.append(
            f"Domain '{hostname}' looks like it's impersonating {brand.title()} but isn't "
            f"{brand}'s real website"
        )

    if any(hostname.endswith(tld) for tld in SUSPICIOUS_TLDS):
        score += 1
        reasons.append(f"Uses a domain ending ({hostname.split('.')[-1]}) commonly seen in scam links")

    if message_text:
        urgency_words = ["immediately", "urgent", "final notice", "act fast", "verify now",
                         "suspend", "expire", "act now", "limited time"]
        if any(w in message_text.lower() for w in urgency_words):
            score += 1
            reasons.append("Message uses urgent/pressure language commonly used in scam texts")

    if not reasons:
        reasons.append("No notable risk signals detected in link analysis.")

    return reasons, score


def risk_level_from_url_score(score):
    if score >= 4:
        return "high"
    elif score >= 2:
        return "medium"
    return "low"


def call_report_verdict(session_id, app_name, risk_level, reasons, explanation_en, explanation_zh):
    """POST to SpacetimeDB's report_verdict reducer, per docs/report-verdict-spike.md.
    Body is a positional JSON array in the exact agreed order. Returns (ok: bool, detail: str)."""
    if not SPACETIME_TOKEN:
        return False, "SPACETIME_TOKEN not set in .env"
    try:
        resp = requests.post(
            REPORT_VERDICT_URL,
            headers={
                "Authorization": f"Bearer {SPACETIME_TOKEN}",
                "Content-Type": "application/json",
            },
            json=[session_id, app_name, risk_level, reasons, explanation_en, explanation_zh],
            timeout=10,
        )
        if resp.status_code == 200:
            return True, "ok"
        elif resp.status_code == 530:
            return False, "HTTP 530 — this identity isn't authorized yet (ask teammate to run set_service_identity)"
        else:
            return False, f"HTTP {resp.status_code}: {resp.text}"
    except Exception as e:
        return False, f"Request failed: {e}"


@app.route("/analyze", methods=["POST"])
def analyze_apk_endpoint():
    if "file" not in request.files:
        return jsonify({"error": "missing 'file' in multipart form"}), 400
    session_id = request.form.get("session_id", "UNKNOWN_SESSION")
    uploaded = request.files["file"]

    with tempfile.TemporaryDirectory() as tmpdir:
        apk_path = Path(tmpdir) / uploaded.filename
        uploaded.save(apk_path)

        result = analyze_single_apk(str(apk_path))
        # Single on-demand calls don't have a "batch" to compare certs across,
        # so shared-cert scoring is skipped here (it's handled offline by
        # score_apps.py for the correlation graph instead).
        score, risk_level, reasons = score_single_app(result, shared_certs={})

        explanations = get_explanation(claude_client, risk_level, reasons) if claude_client else {
            "explanation_en": "", "explanation_zh": "", "explanation_es": "", "explanation_vi": ""
        }

        app_name = result.get("package_name") or result.get("file")

        ok, detail = call_report_verdict(
            session_id, app_name, risk_level, reasons,
            explanations["explanation_en"], explanations["explanation_zh"],
        )

        return jsonify({
            "session_id": session_id,
            "app_name": app_name,
            "risk_level": risk_level,
            "reasons": reasons,
            **explanations,
            "spacetimedb_write": {"ok": ok, "detail": detail},
        }), 200


@app.route("/analyze-url", methods=["POST"])
def analyze_url_endpoint():
    data = request.get_json(silent=True) or {}
    url = data.get("url")
    session_id = data.get("session_id", "UNKNOWN_SESSION")
    message_text = data.get("message_text")  # optional, per teammate's suggestion

    if not url:
        return jsonify({"error": "missing 'url' in JSON body"}), 400

    reasons, score = analyze_url_signals(url, message_text)
    risk_level = risk_level_from_url_score(score)

    explanations = get_explanation(claude_client, risk_level, reasons) if claude_client else {
        "explanation_en": "", "explanation_zh": "", "explanation_es": "", "explanation_vi": ""
    }

    ok, detail = call_report_verdict(
        session_id, url, risk_level, reasons,
        explanations["explanation_en"], explanations["explanation_zh"],
    )

    return jsonify({
        "session_id": session_id,
        "app_name": url,
        "risk_level": risk_level,
        "reasons": reasons,
        **explanations,
        "spacetimedb_write": {"ok": ok, "detail": detail},
    }), 200


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"[*] Starting service on http://127.0.0.1:{port}")
    print(f"[*] report_verdict target: {REPORT_VERDICT_URL}")
    app.run(host="0.0.0.0", port=port, debug=True)