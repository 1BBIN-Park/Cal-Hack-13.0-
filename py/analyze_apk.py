"""
Static analysis script for Cal Hacks 13.0 scam-app detector.
Extracts: permissions, signing cert hash, hardcoded URLs/wallet-like strings,
and whether the app looks like a pure WebView shell.

Usage:
    python3 analyze_apk.py path/to/sample.apk
    python3 analyze_apk.py path/to/folder_of_apks/

Outputs a JSON file per APK next to this script, in ./analysis_output/
"""

import sys
import os
import re
import json
import hashlib
from pathlib import Path

from androguard.misc import AnalyzeAPK

# ---- Regex patterns for hardcoded indicators ----
URL_PATTERN = re.compile(r'https?://[^\s"\'<>]+')
# Very loose heuristics for wallet-looking strings — good enough for a hackathon demo,
# NOT a production-grade wallet validator.
ETH_WALLET_PATTERN = re.compile(r'\b0x[a-fA-F0-9]{40}\b')
BTC_WALLET_PATTERN = re.compile(r'\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b')

# Permissions that are common red flags for this kind of scam app.
SUSPICIOUS_PERMISSIONS = {
    "android.permission.REQUEST_INSTALL_PACKAGES",
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.READ_SMS",
    "android.permission.RECEIVE_SMS",
    "android.permission.READ_CONTACTS",
    "android.permission.BIND_ACCESSIBILITY_SERVICE",
}


def sha256_of_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def get_cert_hash(apk_obj):
    """Return a hash of the signing certificate(s). Empty string if unsigned/unavailable."""
    try:
        certs = apk_obj.get_certificates_der_v2() or apk_obj.get_certificates_der_v3()
        if not certs:
            # fallback to v1 signing
            certs = [apk_obj.get_signature()] if apk_obj.get_signature() else []
        if not certs:
            return ""
        # Hash the first cert's DER bytes — enough to compare "same cert reused across apps"
        return hashlib.sha256(certs[0]).hexdigest()
    except Exception as e:
        return f"ERROR:{e}"


def extract_strings_from_dex(dex_list):
    """Pull all printable strings out of the DEX files for regex scanning."""
    all_strings = []
    for dex in dex_list:
        try:
            all_strings.extend(list(dex.get_strings()))
        except Exception:
            continue
    return all_strings


def is_webview_shell(apk_obj, dex_list):
    """
    Heuristic: app looks like a pure WebView wrapper if WebView-related classes/calls
    dominate and there are very few custom native classes doing real logic.
    This is a heuristic for a hackathon demo, not a rigorous classifier.
    """
    webview_indicators = 0
    total_classes = 0

    for dex in dex_list:
        try:
            for cls in dex.get_classes():
                total_classes += 1
                class_name = cls.get_name()
                # Skip common framework/support library classes when counting "real" classes
                if any(
                    skip in class_name
                    for skip in ["Landroid/", "Lkotlin/", "Landroidx/", "Lcom/google/"]
                ):
                    continue
                methods = cls.get_methods()
                for m in methods:
                    if "WebView" in str(m.get_descriptor()) or "loadUrl" in m.get_name():
                        webview_indicators += 1
    if total_classes == 0:
        return False, 0, 0
    ratio = webview_indicators / max(total_classes, 1)
    # heuristic threshold — tune based on your actual samples
    looks_like_shell = ratio > 0.05 and total_classes < 50
    return looks_like_shell, webview_indicators, total_classes


def analyze_single_apk(apk_path):
    apk_path = str(apk_path)
    print(f"[*] Analyzing {apk_path} ...")

    result = {
        "file": os.path.basename(apk_path),
        "sha256": sha256_of_file(apk_path),
        "package_name": None,
        "permissions": [],
        "suspicious_permissions": [],
        "cert_sha256": "",
        "hardcoded_urls": [],
        "hardcoded_wallet_like_strings": [],
        "is_webview_shell": False,
        "webview_shell_debug": {},
        "errors": [],
    }

    try:
        apk_obj, dex_list, analysis = AnalyzeAPK(apk_path)
    except Exception as e:
        result["errors"].append(f"Failed to parse APK: {e}")
        return result

    # Package name + permissions
    try:
        result["package_name"] = apk_obj.get_package()
        perms = apk_obj.get_permissions() or []
        result["permissions"] = perms
        result["suspicious_permissions"] = [p for p in perms if p in SUSPICIOUS_PERMISSIONS]
    except Exception as e:
        result["errors"].append(f"Permission extraction failed: {e}")

    # Signing cert
    try:
        result["cert_sha256"] = get_cert_hash(apk_obj)
    except Exception as e:
        result["errors"].append(f"Cert extraction failed: {e}")

    # Strings -> URLs + wallet-like patterns
    try:
        all_strings = extract_strings_from_dex(dex_list)
        blob = "\n".join(all_strings)
        result["hardcoded_urls"] = sorted(set(URL_PATTERN.findall(blob)))
        wallets = set(ETH_WALLET_PATTERN.findall(blob)) | set(BTC_WALLET_PATTERN.findall(blob))
        result["hardcoded_wallet_like_strings"] = sorted(wallets)
    except Exception as e:
        result["errors"].append(f"String extraction failed: {e}")

    # WebView shell heuristic
    try:
        is_shell, webview_hits, total_classes = is_webview_shell(apk_obj, dex_list)
        result["is_webview_shell"] = is_shell
        result["webview_shell_debug"] = {
            "webview_indicator_count": webview_hits,
            "non_framework_class_count": total_classes,
        }
    except Exception as e:
        result["errors"].append(f"WebView shell check failed: {e}")

    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 analyze_apk.py <apk_file_or_folder>")
        sys.exit(1)

    target = Path(sys.argv[1])
    out_dir = Path("analysis_output")
    out_dir.mkdir(exist_ok=True)

    if target.is_dir():
        apk_files = list(target.glob("*.apk"))
    elif target.is_file():
        apk_files = [target]
    else:
        print(f"Path not found: {target}")
        sys.exit(1)

    if not apk_files:
        print("No .apk files found.")
        sys.exit(1)

    all_results = []
    for apk_path in apk_files:
        res = analyze_single_apk(apk_path)
        all_results.append(res)

        out_path = out_dir / f"{Path(apk_path).stem}.json"
        with open(out_path, "w") as f:
            json.dump(res, f, indent=2)
        print(f"    -> wrote {out_path}")

    # Also write a combined file — this is what you'll feed into the scoring engine
    combined_path = out_dir / "all_results.json"
    with open(combined_path, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\n[*] Done. Combined results: {combined_path}")


if __name__ == "__main__":
    main()
