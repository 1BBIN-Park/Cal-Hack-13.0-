"""
Correlation graph builder for Cal Hacks scam-app detector.
Reads analysis_output/all_results.json and finds apps that share signals
(signing certificate, hardcoded URLs/domains, wallet addresses) — this is the
data that powers the "these apps are connected" graph in the demo.

Usage:
    python3 build_graph.py
    (reads analysis_output/all_results.json, writes analysis_output/graph.json)
"""

import json
from pathlib import Path
from collections import defaultdict
from urllib.parse import urlsplit

INPUT_PATH = Path("analysis_output/all_results.json")
SCORED_PATH = Path("analysis_output/scored_results.json")
OUTPUT_PATH = Path("analysis_output/graph.json")

# ---- EDIT THIS ----
# Classify each sample for honest labeling in the graph viz, per teammate's
# request: "synthetic" (we built it to demonstrate the correlation logic),
# "benign" (a real, unrelated app used as a safe comparison), or "real" (an
# actual scam sample, if one is ever added). Key by the "file" name as it
# appears in all_results.json.
SAMPLE_TYPE = {
    "org.billthefarmer.notes_141.apk": "benign",
    "com.github.characterdog.bmicalculator_3.apk": "benign",
    "app-debug.apk": "synthetic",
    # Add the sibling APK's file name here once it's built, e.g.:
    # "app-debug-2.apk": "synthetic",
}

# Optional friendlier display names for the graph viz. Falls back to the
# package name if not listed here.
LABELS = {
    "org.billthefarmer.notes": "Notes (benign)",
    "com.github.characterdog.bmicalculator": "BMI Calculator (benign)",
    "com.example.fakescamsample": "Fake Scam Sample (synthetic)",
}


def extract_domain(url):
    try:
        return urlsplit(url).hostname or url
    except Exception:
        return url


def build_edges(results):
    """
    Returns a list of edges: {"from": appA, "to": appB, "shared": "certificate"|"domain"|"wallet", "value": <the shared thing>}
    Compares every pair of apps in the batch for shared cert / shared domain / shared wallet.
    """
    edges = []

    # Index: signal_type -> signal_value -> list of app names sharing it
    cert_index = defaultdict(list)
    domain_index = defaultdict(list)
    wallet_index = defaultdict(list)

    for r in results:
        app_name = r.get("package_name") or r.get("file")

        cert = r.get("cert_sha256", "")
        if cert and not str(cert).startswith("ERROR"):
            cert_index[cert].append(app_name)

        for url in r.get("hardcoded_urls", []):
            domain = extract_domain(url)
            domain_index[domain].append(app_name)

        for wallet in r.get("hardcoded_wallet_like_strings", []):
            wallet_index[wallet].append(app_name)

    def add_edges_from_index(index, label):
        for value, apps in index.items():
            unique_apps = sorted(set(apps))
            if len(unique_apps) < 2:
                continue  # only an interesting signal if 2+ apps share it
            # Connect every pair in this group
            for i in range(len(unique_apps)):
                for j in range(i + 1, len(unique_apps)):
                    edges.append({
                        "from": unique_apps[i],
                        "to": unique_apps[j],
                        "shared": label,
                        "value": value,
                    })

    add_edges_from_index(cert_index, "certificate")
    add_edges_from_index(domain_index, "domain")
    add_edges_from_index(wallet_index, "wallet")

    return edges


def main():
    if not INPUT_PATH.exists():
        print(f"Input not found: {INPUT_PATH}")
        print("Run analyze_apk.py first to generate it.")
        return

    with open(INPUT_PATH) as f:
        results = json.load(f)

    # risk_level lives in scored_results.json, not all_results.json — join on
    # "file" so each node can carry it (per teammate's node shape request).
    risk_by_file = {}
    if SCORED_PATH.exists():
        with open(SCORED_PATH) as f:
            for s in json.load(f):
                risk_by_file[s.get("file")] = s.get("risk_level", "unknown")
    else:
        print(f"[!] {SCORED_PATH} not found — node risk_level will be 'unknown'. "
              f"Run score_apps.py first for complete node data.")

    nodes = []
    for r in results:
        node_id = r.get("package_name") or r.get("file")
        file_name = r.get("file")
        nodes.append({
            "id": node_id,
            "label": LABELS.get(node_id, node_id),
            "file": file_name,
            "risk_level": risk_by_file.get(file_name, "unknown"),
            "sample": SAMPLE_TYPE.get(file_name, "unknown"),
        })
    edges = build_edges(results)

    graph = {"nodes": nodes, "edges": edges}

    with open(OUTPUT_PATH, "w") as f:
        json.dump(graph, f, indent=2)

    print(f"[*] {len(nodes)} nodes, {len(edges)} edges")
    if edges:
        for e in edges:
            print(f"    {e['from']} <-> {e['to']}  (shared {e['shared']}: {e['value']})")
    else:
        print("    No shared signals found across current samples.")
        print("    This is expected with only 1-2 'malicious-pattern' samples —")
        print("    the graph becomes meaningful once there are multiple apps")
        print("    sharing the same cert/domain/wallet (e.g. several scam-app")
        print("    variants from the same operator).")

    print(f"\n[*] Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()