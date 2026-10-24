"""
Static analysis script for Cal Hacks scam-app detector.
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
BTC_WALLET_PATTERN = re.compile(r'\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b')

# URLs containing any of these are framework/tooling noise (XML namespaces, IDE
# tooling links, library feedback forms) — not meaningful app behavior.
FRAMEWORK_URL_SUBSTRINGS = [
    "schemas.android.com",
    "schemas.google.com",
    "www.w3.org",
    "goo.gle",
    "r.android.com",
    "youtrack.jetbrains.com",
    "developer.android.com",
    "kotlinlang.org",
]

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


# Prefixes for framework/library code — these show up in every modern Android app
# (AndroidX, Compose, Kotlin stdlib, Google libs) and should not count as "the app's
# own logic" when we're deciding whether an app is "basically nothing but a WebView".
FRAMEWORK_CLASS_PREFIXES = [
    "Landroid/",
    "Landroidx/",
    "Lkotlin/",
    "Lkotlinx/",
    "Lcom/google/",
    "Lcom/android/",
    "Lorg/jetbrains/",
]


def is_webview_shell(apk_obj, dex_list, all_strings):
    """
    Heuristic: app looks like a pure WebView wrapper if (a) the app's own code
    (excluding framework/library classes) is very small, and (b) WebView is
    referenced somewhere in the app. This is a heuristic for a hackathon demo,
    not a rigorous classifier — tune the thresholds against your real samples.
    """
    non_framework_class_count = 0

    for dex in dex_list:
        try:
            for cls in dex.get_classes():
                class_name = cls.get_name()
                # Auto-generated classes (resource IDs, BuildConfig, compiler-synthesized
                # inner/lambda classes with "$" in the name) aren't "the app's own logic"
                # either, even though they live under the app's own package.
                if "BuildConfig" in class_name:
                    continue
                if "/R$" in class_name or class_name.endswith("/R;"):
                    continue
                if "$" in class_name:
                    continue
                if any(class_name.startswith(prefix) for prefix in FRAMEWORK_CLASS_PREFIXES):
                    continue
                non_framework_class_count += 1
        except Exception:
            continue

    # WebView usage shows up as a type reference in the dex string pool
    # (e.g. "Landroid/webkit/WebView;") even when WebView is just a local
    # variable, which a method-signature check would miss.
    blob = "\n".join(all_strings)
    references_webview = "Landroid/webkit/WebView" in blob or "android.webkit.WebView" in blob

    # Heuristic threshold — a "real" app usually has dozens+ of its own classes
    # (activities, fragments, adapters, view models...). A pure WebView shell
    # typically has only a handful (just the launcher Activity, maybe a couple
    # of theme/util classes).
    looks_like_shell = references_webview and non_framework_class_count <= 30
    return looks_like_shell, references_webview, non_framework_class_count


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

    # Strings -> URLs + wallet-like patterns (also used by the WebView check below)
    all_strings = []
    try:
        all_strings = extract_strings_from_dex(dex_list)
        blob = "\n".join(all_strings)
        found_urls = set(URL_PATTERN.findall(blob))
        # Drop known framework/tooling URLs (XML namespace schemas, Compose/Kotlin
        # tooling links, etc.) that show up in every app and aren't a useful signal.
        found_urls = {u for u in found_urls if not any(fw in u for fw in FRAMEWORK_URL_SUBSTRINGS)}
        result["hardcoded_urls"] = sorted(found_urls)
        wallets = set(ETH_WALLET_PATTERN.findall(blob)) | set(BTC_WALLET_PATTERN.findall(blob))
        result["hardcoded_wallet_like_strings"] = sorted(wallets)
    except Exception as e:
        result["errors"].append(f"String extraction failed: {e}")

    # WebView shell heuristic
    try:
        is_shell, references_webview, non_fw_class_count = is_webview_shell(
            apk_obj, dex_list, all_strings
        )
        result["is_webview_shell"] = is_shell
        result["webview_shell_debug"] = {
            "references_webview": references_webview,
            "non_framework_class_count": non_fw_class_count,
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