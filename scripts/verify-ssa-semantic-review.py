#!/usr/bin/env python3
"""Verify provisional SSA field semantics, never approve SSA PDF population.

Consumes the offline source inventory + 35 source-bound seed candidates and
explicit semantics derived from printed questions. This is a REVIEW AID, not a
legal conclusion, full-form registry, or approved fill binding.
No PHI, AI, web requests, PDF edits, signatures or submission.
"""
import argparse
import hashlib
from collections import defaultdict
import csv
import json
from pathlib import Path

REVIEW_ONLY = "SOURCE_WORDING_REVIEWED_PENDING_INDEPENDENT_QA"
HIGH_RISK_PREFIXES = (
    "authorization.ssa827.", "report.ssa3373.",
    "ssi.application.mailing.", "case.daytime_contact.",
)


def index_source(inventory):
    source = {}
    for form, meta in inventory["forms"].items():
        for page in meta["pages"]:
            for widget in page["interactive_widgets"]:
                leaf = widget["name"].split(".")[-1]
                source.setdefault((form, page["page"], leaf), []).append(widget)
    return source


def verify(inventory, seed, review):
    if inventory.get("missing") or inventory.get("errors") or len(inventory.get("forms", {})) != 7:
        raise ValueError("All seven form source inventories must be error-free")
    if review.get("schema_version") != 1 or review.get("auto_approval") is not False:
        raise ValueError("Invalid/fail-open semantic review schema")
    if review.get("status") != "PROVISIONAL_NOT_APPROVED_FOR_PDF":
        raise ValueError("Semantic review must remain explicitly provisional")
    concepts = review["concepts"]
    seeds = {(s["form_id"], s["page"], s["widget_leaf"]): s for s in seed["candidates"]}
    rows = review["field_reviews"]
    if len(rows) != len(seeds):
        raise ValueError("Every candidate must have one semantic disposition")
    seen = set()
    by_key = defaultdict(list)
    source_by_page = index_source(inventory)
    for r in rows:
        identity = (r["form_id"], r["page"], r["widget_leaf"])
        if identity in seen or identity not in seeds:
            raise ValueError(f"Unknown or duplicate review binding {identity}")
        seen.add(identity)
        raw = seeds[identity]
        if r["original_seed_key"] != raw["canonical_key"] or r["source_cue"] != raw["source_cue"]:
            raise ValueError(f"Seed identity/cue changed: {identity}")
        target = r["proposed_semantic_key"]
        concept = concepts.get(target)
        if not concept:
            raise ValueError(f"Undefined canonical concept {target}")
        if r["subject"] != concept["subject"] or r["time_basis"] != concept["time_basis"]:
            raise ValueError(f"Conflicting subject/time for canonical concept {target}")
        if r["reuse_policy"] != concept["reuse_policy"]:
            raise ValueError(f"Conflicting reuse policy {target}")
        if (r["status"] != REVIEW_ONLY or r["pdf_population_approved"] is not False
            or not r["apply_when"] or not r["source_inspection"]):
            raise ValueError("Semantic reviews are not final PDF approvals")
        form_meta = inventory["forms"][r["form_id"]]
        page = form_meta["pages"][r["page"] - 1]
        if page["page"] != r["page"]:
            raise ValueError("Out-of-order page source")
        matching_widgets = source_by_page.get(identity, [])
        if len(matching_widgets) != 1:
            raise ValueError(f"Ambiguous or missing source widget: {identity}")
        widget = matching_widgets[0]
        if widget["kind"] != "Text" or widget["review_status"] != "UNREVIEWED":
            raise ValueError(f"Unverified or nontext original PDF widget: {identity}")
        cue = " ".join(raw["source_cue"].split()).casefold()
        texts = [" ".join(x["text"].split()).casefold() for x in page["printed_lines"]]
        if not any(cue in x for x in texts):
            raise ValueError(f"Printed source cue not found on page {identity}")
        # Guard original pilot misbindings: subject/signer/preparer and
        # addressee/residence must be distinct canonical concepts.
        if r["form_id"] == "SSA-827" and r["widget_leaf"] in (
            "P1_Name1_FLD[0]", "P1_SSN1_FLD[0]", "P1_DOB_FLD[0]"
        ) and not target.startswith("authorization.ssa827.records_subject."):
            raise ValueError("SSA-827 records subject incorrectly routed")
        if r["form_id"] == "SSA-3373-BK" and r["page"] == 10 and r["widget_leaf"] == "Name_FLD[0]" and target != "report.ssa3373.completer.name":
            raise ValueError("SSA-3373 preparer name must not map to claimant")
        if r["form_id"] == "SSA-8000-BK" and r["widget_leaf"].startswith("P1_Q2") and not target.startswith("ssi.application.mailing."):
            raise ValueError("SSI applicant mailing cannot silently map to claimant residence")
        if r["form_id"] == "SSA-3373-BK" and r["widget_leaf"] in ("AreaCode_FLD[0]", "Phone_FLD[0]") and not target.startswith("report.ssa3373.daytime_phone."):
            raise ValueError("Unqualified day phone fragment mapping")
        if r["form_id"] == "SSA-16" and "preferred_language" in target and "English is not preferred" not in r["apply_when"]:
            raise ValueError("Lost SSA-16 conditional language question")
        if target.startswith(HIGH_RISK_PREFIXES) and r["subject"] == "benefits_claimant":
            raise ValueError("High-risk field cannot be silently treated as claimant answer")
        by_key[target].append(r)
    if set(seeds) != seen:
        raise ValueError(f"Missing semantic dispositions: {len(set(seeds)-seen)}")
    unique_roles = {}
    for key, group in by_key.items():
        kinds = {(x["subject"], x["time_basis"], x["reuse_policy"]) for x in group}
        if len(kinds) != 1:
            raise ValueError(f"Source concepts disagree on identity/time: {key}")
        unique_roles[key] = {"subject": group[0]["subject"],
                             "time_basis": group[0]["time_basis"],
                             "reuse_policy": group[0]["reuse_policy"],
                             "forms": sorted({x["form_id"] for x in group}),
                             "field_count": len(group),
                             "reusable_only_after_case_verification": True}
    total = sum(x["interactive_widget_count"] for x in inventory["forms"].values())
    # Form metadata XFA/non-verified copies are explicitly blocking.
    warnings = []
    for form, meta in inventory["forms"].items():
        if len(meta.get("printed_edition_markers", [])) > 1:
            warnings.append(f"{form}: conflicting printed edition labels")
        if meta.get("pdf_technology", {}).get("xfa"):
            warnings.append(f"{form}: XFA manual visual output verification required")
        if meta.get("source_verification") not in (
            "MATCHES_LOCAL_HTTPS_DOWNLOAD_MANIFEST_EDITION_NOT_VISUALLY_VERIFIED",
            "NO_DOWNLOAD_MANIFEST_OFFICIAL_SOURCE_UNCONFIRMED"):
            warnings.append(f"{form}: source provenance must be independently verified")
    summary = {"source_pdf_widgets": total,
               "provisional_semantically_reviewed_widgets": len(rows),
               "remaining_without_semantic_review": total-len(rows),
               "semantic_concepts": len(unique_roles),
               "safe_for_pdf_population": 0, "independently_approved": 0,
               "cross_form_reuse_candidate_concepts":
                   sum(len(c["forms"]) > 1 for c in unique_roles.values())}
    return {"schema_version": 1, "status": "PROVISIONAL_SEMANTIC_REVIEW_ONLY",
            "summary": summary, "warnings": warnings,
            "critical_non_equivalences": review["critical_non_equivalences"],
            "concepts": unique_roles,
            "field_reviews": rows}


def write_results(result, output):
    output.mkdir(parents=True, exist_ok=True)
    (output / "ssa-semantic-review-batch1.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    path = output / "ssa-semantic-review-batch1.csv"
    fields = [
        "form_id", "page", "widget_leaf", "source_cue", "original_seed_key",
        "proposed_semantic_key", "subject", "time_basis", "reuse_policy",
        "apply_when", "rule", "source_inspection", "status",
        "pdf_population_approved"
    ]
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for r in result["field_reviews"]:
            writer.writerow({k: r.get(k, "") for k in fields})
    return path


def verify_original_pdf_bytes(inventory, template_dir):
    """Independently confirm cached originals still match the audited hashes."""
    for form, meta in inventory["forms"].items():
        path = template_dir / meta["source_filename"]
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"Missing or unsafe local original for {form}: {path}")
        if hashlib.sha256(path.read_bytes()).hexdigest() != meta["source_sha256"]:
            raise ValueError(f"Local source PDF digest changed: {form}. Re-audit before review.")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--inventory", type=Path, required=True)
    ap.add_argument("--seed", type=Path,
                    default=Path("config/ssa-canonical-seed-candidates.json"))
    ap.add_argument("--semantic", type=Path,
                    default=Path("config/ssa-semantic-review-batch1.json"))
    ap.add_argument("--template-dir", type=Path, default=Path(".local/ssa-templates"),
                    help="Original seven blank PDFs: SHA-256 must match source inventory")
    ap.add_argument("--out-dir", type=Path,
                    default=Path(".local/ssa-templates/crosswalk-review"))
    args = ap.parse_args()
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    verify_original_pdf_bytes(inventory, args.template_dir)
    result = verify(
        inventory,
        json.loads(args.seed.read_text(encoding="utf-8")),
        json.loads(args.semantic.read_text(encoding="utf-8"))
    )
    path = write_results(result, args.out_dir)
    print(json.dumps(result["summary"], indent=2))
    print("Review CSV:", path)
    print("No mapping has independent signoff. PDF population and package readiness BLOCKED.")


if __name__ == "__main__":
    main()
