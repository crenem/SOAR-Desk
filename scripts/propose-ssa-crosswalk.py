#!/usr/bin/env python3
"""Generate HUMAN-REVIEW-ONLY SSA canonical field candidates from blank PDFs.

Never promotes an SSA form binding, signs/fills a form, or processes case data.
Uses only exact widget leaf + page + printed cue; no fuzzy or LLM matching.
"""
import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

STATUS = "SOURCE_MATCHED_NOT_SEMANTICALLY_APPROVED"


def normalized(value):
    return " ".join(str(value).casefold().split())


def verify_pdf_hashes(inventory, paths, require=False):
    results = {}
    for form, meta in inventory["forms"].items():
        path = paths.get(form)
        if path is None:
            if require:
                raise ValueError(f"Missing SHA-bound PDF source for {form}")
            results[form] = "NOT_CHECKED"
            continue
        pdf = Path(path)
        if not pdf.is_file():
            raise ValueError(f"Cannot read original PDF {pdf}")
        if hashlib.sha256(pdf.read_bytes()).hexdigest() != meta["source_sha256"]:
            raise ValueError(f"SHA-256 mismatch for {form}; refuse all bindings")
        results[form] = "MATCHES_SOURCE_SHA256"
    return results


def seed_candidates(inventory, seed):
    results = []
    used = set()
    for raw in seed["candidates"]:
        form, page_number = raw["form_id"], raw["page"]
        if form not in inventory["forms"]:
            raise ValueError(f"Unknown form {form}")
        meta = inventory["forms"][form]
        if not isinstance(page_number, int) or not 1 <= page_number <= len(meta["pages"]):
            raise ValueError(f"Invalid page for {form}: {page_number}")
        page = meta["pages"][page_number - 1]
        if page["page"] != page_number:
            raise ValueError(f"Out-of-order source page for {form}")
        widgets = [w for w in page["interactive_widgets"]
                   if w["name"].split(".")[-1] == raw["widget_leaf"]]
        if len(widgets) != 1:
            raise ValueError(f"Ambiguous/missing exact PDF widget: {form} p{page_number} {raw['widget_leaf']}")
        widget = widgets[0]
        identity = (form, widget["item_id"])
        if identity in used:
            raise ValueError(f"Duplicate mapping for source widget {identity}")
        used.add(identity)
        if widget["kind"] != "Text":
            raise ValueError(f"Checkbox/radio-group mapping needs separate approval: {identity}")
        if not any(normalized(raw["source_cue"]) in normalized(line["text"])
                   for line in page["printed_lines"]):
            raise ValueError(f"Printed cue not found in {form} p{page_number}: {raw['source_cue']}")
        results.append({**raw,
                        "source_sha256": meta["source_sha256"],
                        "page_identity": f"{form}@{meta['source_sha256']}:p{page_number}",
                        "widget_item_id": widget["item_id"],
                        "widget_name": widget["name"],
                        "widget_kind": widget["kind"],
                        "widget_bbox": widget["bbox"],
                        "edition_markers": meta.get("printed_edition_markers", []),
                        "approval_status": STATUS,
                        "human_reviewed": False,
                        "pdf_population_approved": False})
    return results


def reconcile_queue(inventory, filename):
    expected = {}
    for form, meta in inventory["forms"].items():
        for page in meta["pages"]:
            for kind, collection in (("printed_line", page["printed_lines"]),
                                     ("pdf_widget", page["interactive_widgets"])):
                for item in collection:
                    identity = (form, item["item_id"])
                    if identity in expected:
                        raise ValueError(f"Duplicate inventory identity: {identity}")
                    expected[identity] = kind
    found, counts = set(), Counter()
    with open(filename, encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            identity = (row["form_id"], row["item_id"])
            if identity in found:
                raise ValueError(f"Duplicate review row: {identity}")
            found.add(identity)
            counts[row["item_type"]] += 1
            if row["review_status"] != "UNREVIEWED":
                raise ValueError("Input has modified approval statuses; investigate separately")
            if row["item_type"] in ("printed_line", "pdf_widget"):
                if expected.get(identity) != row["item_type"]:
                    raise ValueError(f"Inventory/queue divergence at {identity}")
            elif row["item_type"] != "page_review":
                raise ValueError(f"Unexpected queue type {row['item_type']}")
    if not set(expected).issubset(found):
        raise ValueError(f"Missing {len(set(expected)-found)} source entries in queue")
    if counts["page_review"] != sum(v["source_pages"] for v in inventory["forms"].values()):
        raise ValueError("Missing or duplicated source-page review rows")
    return counts


def generate(inventory, queue_path, seed, output, pdfs=None, require_pdfs=False):
    if inventory.get("missing") or inventory.get("errors") or len(inventory["forms"]) != 7:
        raise ValueError("Seven error-free source forms required")
    pdf_result = verify_pdf_hashes(inventory, pdfs or {}, require_pdfs)
    row_counts = reconcile_queue(inventory, queue_path)
    proposals = seed_candidates(inventory, seed)
    by_widget = {(p["form_id"], p["widget_item_id"]): p for p in proposals}
    by_key = defaultdict(list)
    for p in proposals:
        by_key[p["canonical_key"]].append(p)
    matrix = []
    for key, entries in sorted(by_key.items()):
        forms = sorted({e["form_id"] for e in entries})
        matrix.append({"canonical_key": key, "forms": forms,
                       "form_count": len(forms), "candidate_widget_count": len(entries),
                       "respondents": sorted({e["subject"] for e in entries}),
                       "human_reviewed": False,
                       "reuse_candidate": len(forms) > 1})
    warnings = []
    for form, meta in inventory["forms"].items():
        if len(meta.get("printed_edition_markers", [])) > 1:
            warnings.append(f"{form}: conflicting printed editions; do not approve template")
        if meta.get("pdf_technology", {}).get("xfa"):
            warnings.append(f"{form}: XFA detected; PDF fill/render compatibility must be tested")
        if pdf_result[form] != "MATCHES_SOURCE_SHA256":
            warnings.append(f"{form}: uploaded PDF SHA not independently checked")
    warnings.extend([
        "SSA-3373: applicant name on page 3 and report completer on page 10 use the same widget leaf; DO NOT MERGE",
        "SSA-827: records subject and authorized signer are not necessarily the same person",
        "SSA-8000: SSI filing-month financial facts require separate timeframes from present-day data",
        "SSA-8001: deferred/abbreviated SSI filing, not default replacement for SSA-8000",
    ])
    total = sum(meta["interactive_widget_count"] for meta in inventory["forms"].values())
    result = {"schema_version": 1, "status": "UNREVIEWED_CANONICAL_CANDIDATES",
              "source_verification": pdf_result,
              "summary": {"form_count": 7, "pdf_widget_count": total,
                          "queue_row_count": sum(row_counts.values()),
                          "candidate_widget_count": len(proposals),
                          "unmapped_widget_count": total-len(proposals),
                          "candidate_canonical_key_count": len(matrix),
                          "cross_form_reuse_candidate_count": sum(p["reuse_candidate"] for p in matrix),
                          "approved_field_bindings": 0},
              "warnings": warnings, "overlap": matrix, "field_candidates": proposals}
    output.mkdir(parents=True, exist_ok=True)
    (output/"ssa-canonical-crosswalk-candidates.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    with open(queue_path, newline="", encoding="utf-8") as original, \
         (output/"ssa-review-queue-with-proposals.csv").open("w", newline="", encoding="utf-8") as out:
        reader = csv.DictReader(original)
        columns = list(reader.fieldnames) + [
            "proposed_canonical_key", "proposed_subject", "proposed_source_cue", "suggestion_status"]
        writer = csv.DictWriter(out, fieldnames=columns)
        writer.writeheader()
        for row in reader:
            p = by_widget.get((row["form_id"], row["item_id"]))
            row.update(proposed_canonical_key=p["canonical_key"] if p else "",
                       proposed_subject=p["subject"] if p else "",
                       proposed_source_cue=p["source_cue"] if p else "",
                       suggestion_status=STATUS if p else "")
            writer.writerow(row)
    with (output/"ssa-cross-form-overlap.csv").open("w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=["canonical_key","forms","form_count",
                              "candidate_widget_count","respondents","human_reviewed","reuse_candidate"])
        writer.writeheader()
        for entry in matrix:
            writer.writerow({**entry,"forms":" | ".join(entry["forms"]),
                             "respondents":" | ".join(entry["respondents"])})
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--inventory", type=Path, required=True)
    p.add_argument("--queue", type=Path, required=True)
    p.add_argument("--seeds", type=Path, default=Path("config/ssa-canonical-seed-candidates.json"))
    p.add_argument("--out-dir", type=Path, default=Path(".local/ssa-templates/crosswalk-review"))
    p.add_argument("--template-dir",type=Path,default=None,
                   help="Directory holding exact blank PDFs named as in source inventory")
    p.add_argument("--pdf", action="append", default=[], help="FORM_ID=path to exact blank PDF")
    p.add_argument("--require-pdf-match", action="store_true")
    args = p.parse_args()
    pdfs = {}
    for entry in args.pdf:
        if "=" not in entry:
            p.error("--pdf expects FORM_ID=/path/to/file.pdf")
        form, path = entry.split("=", 1)
        if form in pdfs:
            p.error("duplicate PDF argument")
        pdfs[form] = path
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    if args.template_dir is not None:
        for form, meta in inventory["forms"].items():
            pdfs.setdefault(form, args.template_dir / meta["source_filename"])
    result = generate(inventory,
                      args.queue, json.loads(args.seeds.read_text(encoding="utf-8")),
                      args.out_dir, pdfs, args.require_pdf_match)
    print(json.dumps(result["summary"], indent=2))
    print("Review-only: ZERO field bindings automatically approved.")


if __name__ == "__main__":
    main()
