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
import socket
import ipaddress
import difflib
import tempfile
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, urljoin

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
from explain_with_claude import get_explanation, build_fallback_explanation, MODEL

load_dotenv()

app = Flask(__name__)
CORS(app)  # handles OPTIONS preflight automatically for the /analyze-url JSON endpoint
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB upload cap

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

# Real official domains/subdomains for the brands above, so we don't flag the
# genuine site (irs.gov, secure.chase.com, etc.) as impersonating itself.
# Judges may well type the real site during the demo.
ALLOWED_OFFICIAL_DOMAINS = {
    "irs.gov", "medicare.gov", "ssa.gov", "usps.com", "dmv.ca.gov",
    "secure.chase.com", "chase.com", "bankofamerica.com",
    "wellsfargo.com", "paypal.com", "venmo.com", "apple.com",
    "amazon.com", "fedex.com", "ups.com", "santander.com", "santanderbank.com",
    "coinbase.com", "binance.com", "fidelity.com",
}


def is_allowed_official_domain(hostname):
    host_lower = hostname.lower()
    return any(
        host_lower == d or host_lower.endswith("." + d)
        for d in ALLOWED_OFFICIAL_DOMAINS
    )


# Private/loopback/link-local ranges we refuse to let the link-check reach,
# so a malicious link can't make this server probe internal/local addresses
# (e.g. localhost:4040, 169.254.x.x cloud metadata, LAN devices).
def is_private_host(hostname):
    """True only when the hostname actually resolves to a private/internal
    address. A hostname that doesn't resolve at all (dead/fake scam domain,
    e.g. the Fidelity typosquat) is NOT "private" — it's just unreachable,
    which the caller's request attempt will surface on its own."""
    try:
        resolved_ips = {info[4][0] for info in socket.getaddrinfo(hostname, None)}
    except Exception:
        # Can't resolve -> nothing to protect against; let the normal
        # connection attempt fail naturally and be reported as unreachable.
        return False
    for ip_str in resolved_ips:
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return True
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return True
    return False


def resolve_redirect_chain(url, max_hops=5):
    """Follow redirects ourselves (allow_redirects=False) so we can check
    each hop's resolved address BEFORE connecting to it, instead of letting
    requests connect to every hop first and checking afterward.
    Returns (final_url, redirected, blocked_private)."""
    current = url
    redirected = False
    for _ in range(max_hops):
        hostname = urlsplit(current).hostname or ""
        if hostname and is_private_host(hostname):
            return current, redirected, True

        resp = requests.get(current, allow_redirects=False, stream=True, timeout=5)
        resp.close()  # never read the body — APKs included

        if resp.status_code in (301, 302, 303, 307, 308) and "Location" in resp.headers:
            next_url = urljoin(current, resp.headers["Location"])
            if next_url != current:
                redirected = True
            current = next_url
            continue

        return current, redirected, False

    return current, redirected, False


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

    # The real official site (or a real subdomain of it) is never flagged as
    # impersonating itself.
    if is_allowed_official_domain(host_lower):
        return False, None

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
        # Follows redirects ourselves, checking each hop's resolved address
        # BEFORE connecting to it — never reads a response body (stream=True
        # + close()), keeping the "never auto-download from a link" rule
        # intact even for APK links.
        final_url, redirected, blocked_private = resolve_redirect_chain(url)
        if blocked_private:
            reasons.append("Link redirects to a private/internal address; not following it further.")
            score += 1
        elif redirected and final_url != url:
            reasons.append(f"Link redirects to a different address: {final_url}")
            score += 1
    except Exception:
        # Dead/unresolvable domain (e.g. a fake scam link that never
        # resolves), connection refused, timeout, etc. — that's fine, we
        # still analyze the URL itself below.
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
        # Never trust the client-supplied filename (could contain path
        # traversal like "../../x" or an absolute path) — always save under
        # a fixed name inside our own temp dir.
        apk_path = Path(tmpdir) / "upload.apk"
        uploaded.save(apk_path)

        result = analyze_single_apk(str(apk_path))
        # Single on-demand calls don't have a "batch" to compare certs across,
        # so shared-cert scoring is skipped here (it's handled offline by
        # score_apps.py for the correlation graph instead).
        score, risk_level, reasons = score_single_app(result, shared_certs={})

        explanations = (
            get_explanation(claude_client, risk_level, reasons, subject_type="app")
            if claude_client else build_fallback_explanation(risk_level, subject_type="app")
        )

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
    # Teammate's app sends the field as "message" — also accept "message_text"
    # for backward compatibility with earlier testing.
    message_text = data.get("message") or data.get("message_text")

    if not url:
        return jsonify({"error": "missing 'url' in JSON body"}), 400

    reasons, score = analyze_url_signals(url, message_text)
    risk_level = risk_level_from_url_score(score)

    explanations = (
        get_explanation(claude_client, risk_level, reasons, subject_type="link")
        if claude_client else build_fallback_explanation(risk_level, subject_type="link")
    )

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
    # debug=False: the Flask debugger must not be reachable from a public
    # ngrok URL — its interactive error pages can leak the SMS/link text
    # and let anyone run arbitrary code via the debugger console.
    app.run(host="0.0.0.0", port=port, debug=False)