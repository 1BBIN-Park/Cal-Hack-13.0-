"""
Scoring engine for Cal Hacks scam-app detector.
Reads analysis_output/all_results.json (produced by analyze_apk.py) and assigns
each app a risk_level + human-readable reasons, based on weighted rules.

This is a deterministic rules engine — NOT an LLM. Claude's job (next step) is
only to translate these structured reasons into plain-language explanations.

Usage:
    python3 score_apps.py
    (reads analysis_output/all_results.json, writes analysis_output/scored_results.json)
"""

import json
from pathlib import Path
from collections import defaultdict

INPUT_PATH = Path("analysis_output/all_results.json")
OUTPUT_PATH = Path("analysis_output/scored_results.json")

# ---- Scoring weights ----
# Tune these against your actual samples — these are reasonable starting points,
# not a validated model.
POINTS_SUSPICIOUS_PERMISSIONS = 2
POINTS_WEBVIEW_SHELL = 2
POINTS_WALLET_STRING = 2
POINTS_HARDCODED_URL = 1
POINTS_SHARED_CERT = 3  # strongest signal: same signer as another analyzed app

# Risk level thresholds (total points -> label)
RISK_THRESHOLDS = [
    (5, "high"),
    (2, "medium"),
    (0, "low"),
]


def risk_level_from_score(score):
    for threshold, label in RISK_THRESHOLDS:
        if score >= threshold:
            return label
    return "low"


def find_shared_certs(results):
    """
    Map cert_sha256 -> list of app file names that share it.
    Only certs that appear more than once (across apps analyzed in this batch)
    are "shared" in a meaningful sense.
    """
    cert_to_apps = defaultdict(list)
    for r in results:
        cert = r.get("cert_sha256", "")
        if cert and not cert.startswith("ERROR"):
            cert_to_apps[cert].append(r.get("file", "unknown"))
    return {cert: apps for cert, apps in cert_to_apps.items() if len(apps) > 1}


def score_single_app(result, shared_certs):
    score = 0
    reasons = []

    suspicious_perms = result.get("suspicious_permissions", [])
    if suspicious_perms:
        score += POINTS_SUSPICIOUS_PERMISSIONS
        reasons.append(
            f"Requests permissions commonly abused in scam apps: {', '.join(suspicious_perms)}"
        )

    if result.get("is_webview_shell"):
        score += POINTS_WEBVIEW_SHELL
        reasons.append(
            "App is essentially just a wrapper around a webpage (WebView shell) "
            "with very little of its own native functionality"
        )

    wallets = result.get("hardcoded_wallet_like_strings", [])
    if wallets:
        score += POINTS_WALLET_STRING
        reasons.append(
            f"Contains hardcoded string(s) that look like cryptocurrency wallet addresses: "
            f"{', '.join(wallets[:3])}"
            + (f" (+{len(wallets) - 3} more)" if len(wallets) > 3 else "")
        )

    urls = result.get("hardcoded_urls", [])
    if urls:
        score += POINTS_HARDCODED_URL
        reasons.append(
            f"Contains hardcoded URL(s) the app connects to: {', '.join(urls[:3])}"
            + (f" (+{len(urls) - 3} more)" if len(urls) > 3 else "")
        )

    cert = result.get("cert_sha256", "")
    if cert in shared_certs:
        other_apps = [a for a in shared_certs[cert] if a != result.get("file")]
        score += POINTS_SHARED_CERT
        reasons.append(
            f"Signed with the same certificate as other analyzed app(s): {', '.join(other_apps)} "
            f"— possible sign of the same operator behind multiple apps"
        )

    # Assumption baked into this whole pipeline: everything that reaches this
    # scorer arrived via share-sheet / manual upload, i.e. NOT from the Play
    # Store. We don't have a reliable way to verify Play Store origin from the
    # APK alone in this hackathon scope, so this is a documented assumption,
    # not a detected signal — it's intentionally NOT added as a scored reason.

    if not reasons:
        reasons.append("No notable risk signals detected in static analysis.")

    return score, risk_level_from_score(score), reasons


def main():
    if not INPUT_PATH.exists():
        print(f"Input not found: {INPUT_PATH}")
        print("Run analyze_apk.py first to generate it.")
        return

    with open(INPUT_PATH) as f:
        results = json.load(f)

    if not results:
        print("No results to score.")
        return

    shared_certs = find_shared_certs(results)

    scored = []
    for r in results:
        score, risk_level, reasons = score_single_app(r, shared_certs)
        scored.append(
            {
                "app_name": r.get("package_name") or r.get("file"),
                "file": r.get("file"),
                "sha256": r.get("sha256"),
                "risk_level": risk_level,
                "score": score,
                "reasons": reasons,
            }
        )

    with open(OUTPUT_PATH, "w") as f:
        json.dump(scored, f, indent=2)

    # Quick console summary — useful for a sanity check and for precision/recall
    # bookkeeping later.
    print(f"\n{'File':<40} {'Risk':<8} {'Score':<6}")
    print("-" * 56)
    for s in scored:
        print(f"{s['file']:<40} {s['risk_level']:<8} {s['score']:<6}")

    print(f"\n[*] Wrote {OUTPUT_PATH}")
    if shared_certs:
        print(f"[*] Found {len(shared_certs)} certificate(s) shared across multiple apps — "
              f"good data for your correlation graph.")


if __name__ == "__main__":
    main()