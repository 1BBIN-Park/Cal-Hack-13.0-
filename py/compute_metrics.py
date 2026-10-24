"""
Precision/recall calculator for Cal Hacks scam-app detector.
Compares the scoring engine's risk_level output against your own manually-
labeled ground truth, so you have real numbers for the pitch and judging
criteria.

IMPORTANT: Edit GROUND_TRUTH below to label each sample yourself — this has
to be your own judgment call about which samples are actually
scam-patterned vs benign (you know this because you built/chose them).

Usage:
    python3 compute_metrics.py
    (reads analysis_output/scored_results.json, prints + writes analysis_output/metrics.json)
"""

import json
from pathlib import Path

INPUT_PATH = Path("analysis_output/scored_results.json")
OUTPUT_PATH = Path("analysis_output/metrics.json")

# ---- EDIT THIS ----
# Map each file name (as it appears in scored_results.json's "file" field) to
# "scam" or "benign" based on what you actually know about the sample.
GROUND_TRUTH = {
    "org.billthefarmer.notes_141.apk": "benign",
    "com.github.characterdog.bmicalculator_3.apk": "benign",
    "app-debug.apk": "scam",
}

# A sample is treated as "flagged" by the tool if its risk_level is at or
# above this threshold. Change to "high" if you want a stricter definition
# of a "flag" (medium would then count as not-flagged).
FLAG_THRESHOLD_LEVELS = {"medium", "high"}


def main():
    if not INPUT_PATH.exists():
        print(f"Input not found: {INPUT_PATH}")
        print("Run score_apps.py first to generate it.")
        return

    with open(INPUT_PATH) as f:
        scored = json.load(f)

    tp = fp = tn = fn = 0
    rows = []

    for item in scored:
        file_name = item["file"]
        truth = GROUND_TRUTH.get(file_name)
        if truth is None:
            print(f"[!] No ground truth label for {file_name} — skipping. Add it to GROUND_TRUTH.")
            continue

        flagged = item["risk_level"] in FLAG_THRESHOLD_LEVELS
        actually_scam = truth == "scam"

        if flagged and actually_scam:
            outcome = "TP"
            tp += 1
        elif flagged and not actually_scam:
            outcome = "FP"
            fp += 1
        elif not flagged and actually_scam:
            outcome = "FN"
            fn += 1
        else:
            outcome = "TN"
            tn += 1

        rows.append({
            "file": file_name,
            "risk_level": item["risk_level"],
            "ground_truth": truth,
            "flagged": flagged,
            "outcome": outcome,
        })

    total = tp + fp + tn + fn
    precision = tp / (tp + fp) if (tp + fp) > 0 else None
    recall = tp / (tp + fn) if (tp + fn) > 0 else None
    accuracy = (tp + tn) / total if total > 0 else None

    print(f"\n{'File':<40} {'Risk':<8} {'Truth':<8} {'Flagged':<8} {'Outcome'}")
    print("-" * 80)
    for r in rows:
        print(f"{r['file']:<40} {r['risk_level']:<8} {r['ground_truth']:<8} {str(r['flagged']):<8} {r['outcome']}")

    print(f"\nConfusion matrix: TP={tp}  FP={fp}  TN={tn}  FN={fn}  (n={total})")
    print(f"Precision: {precision:.2f}" if precision is not None else "Precision: n/a (no positives flagged)")
    print(f"Recall:    {recall:.2f}" if recall is not None else "Recall:    n/a (no actual positives)")
    print(f"Accuracy:  {accuracy:.2f}" if accuracy is not None else "Accuracy:  n/a")

    print(
        "\n[!] NOTE: n is very small — this is a directional sanity check, not a "
        "statistically meaningful evaluation. Say this plainly in the pitch; "
        "judges will respect the honesty more than an inflated claim."
    )

    metrics = {
        "rows": rows,
        "confusion_matrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "precision": precision,
        "recall": recall,
        "accuracy": accuracy,
        "n": total,
    }
    with open(OUTPUT_PATH, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"\n[*] Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()