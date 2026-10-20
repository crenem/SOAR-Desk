#!/usr/bin/env python3
"""Offline, loss-conscious inventory of BLANK official SSA PDF form sources.

Every machine-discovered item remains UNREVIEWED. OCR/printed words and PDF
widget positions are CANDIDATES, never authoritative legal-question mappings.
The official blank PDFs stay in the gitignored local cache. No claimant data,
model inference, network requests, or automatic form filling are involved.

Example:
 python3 scripts/audit-ssa-source-forms.py \
   --template-dir .local/ssa-templates \
   --output .local/ssa-templates/all-form-field-inventory.json

Exit 2 if any required source is missing or malformed. Exit 0 only means
all local PDFs were inventoried, NOT that a form has been verified or mapped.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re

import fitz

FORM_CATALOG = {
    "SSA-16": "ssa-16-bk.pdf",
    "SSA-8000-BK": "ssa-8000-bk.pdf",
    "SSA-8001-BK": "ssa-8001-bk.pdf",
    "SSA-3368-BK": "ssa-3368-bk.pdf",
    "SSA-827": "ssa-827.pdf",
    "SSA-3369-BK": "ssa-3369.pdf",
    "SSA-3373-BK": "ssa-3373-bk.pdf",
}
# Registry URLs are navigation aids, not proof that a local file came from SSA.
FORM_URLS = {
    "SSA-16": "https://www.ssa.gov/forms/ssa-16-bk.pdf",
    "SSA-8000-BK": "https://www.ssa.gov/forms/ssa-8000-bk.pdf",
    "SSA-8001-BK": "https://www.ssa.gov/forms/ssa-8001-bk.pdf",
    "SSA-3368-BK": "https://www.ssa.gov/forms/ssa-3368-bk.pdf",
    "SSA-827": "https://www.ssa.gov/forms/ssa-827.pdf",
    "SSA-3369-BK": "https://www.ssa.gov/forms/ssa-3369.pdf",
    "SSA-3373-BK": "https://www.ssa.gov/forms/ssa-3373-bk.pdf",
}
# Advisory based on the previously observed PDF set; SSA can update editions.
EXPECTED_PAGES = {
    "SSA-16": 7, "SSA-8000-BK": 24, "SSA-8001-BK": None,
    "SSA-3368-BK": 15, "SSA-827": 2, "SSA-3369-BK": 14,
    "SSA-3373-BK": 10,
}
# There are many page layouts; this regex identifies review candidates only.
NUMBERED_CUE = re.compile(
    r"^\s*(?:(?:ITEM|PART|SECTION|QUESTION)\s+)?"
    r"(\d{1,3}(?:[.][A-Za-z0-9]{1,3}){0,3})\s*[.):-]?\s+",
    re.I,
)
SIGNATURE_CUE = re.compile(
    r"\b(?:SIGNATURE|WITNESS|SIGNED|SIGN\s+HERE|PARENT\s+OR\s+GUARDIAN)\b", re.I)
CONTINUATION_CUE = re.compile(
    r"\b(?:CONTINU(?:ED|ATION)|REMARKS|ADDITIONAL\s+(?:SPACE|PAGE)|"
    r"ATTACH\s+(?:ANOTHER|A|ADDITIONAL)|USE\s+MORE\s+SPACE)\b", re.I)
SSA_ONLY_CUE = re.compile(
    r"\b(?:FOR\s+(?:SSA|SOCIAL SECURITY)\s+USE\s+ONLY|"
    r"DO\s+NOT\s+WRITE\s+IN\s+THIS\s+SPACE)\b", re.I)
MAX_BYTES = 26 * 1024 * 1024
MAX_PAGES = 200
MAX_WIDGETS_PER_PAGE = 750
EDGE_GAP_POINTS = 6.0
QUEUE_COLUMNS = (
    "form_id", "source_sha256", "item_id", "item_type", "page", "subindex",
    "candidate_question_number", "candidate_semantics", "text_or_widget",
    "pdf_widget_kind", "widget_on_states", "bbox", "review_status",
    "approved_canonical_key", "reviewer", "reviewed_at_utc", "review_notes",
)


def stable_id(source_sha256, page_num, kind, ordinal):
    return hashlib.sha256(
        f"{source_sha256}:{page_num}:{kind}:{ordinal}".encode("utf-8")
    ).hexdigest()[:20]


def box(rect):
    return [round(float(x), 2) for x in rect]


def near_crop_edge(bbox, crop_rect):
    # Potentially clipped text, not proof that a line has actually been cut.
    return (bbox[0] <= crop_rect.x0 + EDGE_GAP_POINTS
            or bbox[1] <= crop_rect.y0 + EDGE_GAP_POINTS
            or bbox[2] >= crop_rect.x1 - EDGE_GAP_POINTS
            or bbox[3] >= crop_rect.y1 - EDGE_GAP_POINTS)


def form_technology(pdf):
    """Detect AcroForm/XFA without assuming text-field widgets cover every form."""
    try:
        catalog = pdf.pdf_catalog()
        kind, val = pdf.xref_get_key(catalog, "AcroForm")
        if kind == "dict":
            # PyMuPDF may expose a PDF catalog's inline AcroForm dictionary,
            # rather than an indirect reference. Inspect it conservatively.
            return {"acroform": True, "xfa": "/XFA" in val}
        if kind != "xref":
            return {"acroform": bool(pdf.is_form_pdf), "xfa": False,
                    "requires_manual_inspection": bool(pdf.is_form_pdf)}
        xref = int(val.split()[0])
        xfa_kind, _ = pdf.xref_get_key(xref, "XFA")
        return {"acroform": True, "xfa": xfa_kind not in ("null", "none")}
    except (ValueError, RuntimeError, IndexError, TypeError):
        return {"acroform": False, "xfa": False, "requires_manual_inspection": True}


def classification(text, candidate_number):
    tags = []
    if candidate_number:
        tags.append("numbered_question_candidate")
    if SIGNATURE_CUE.search(text):
        tags.append("signature_or_witness_candidate")
    if CONTINUATION_CUE.search(text):
        tags.append("continuation_or_remarks_candidate")
    if SSA_ONLY_CUE.search(text):
        tags.append("ssa_only_candidate")
    return tags or ["printed_text_unclassified"]


def inspect_blank(pdf_path: Path, form_id: str) -> dict:
    if form_id not in FORM_CATALOG:
        raise ValueError("Form is not in the reviewed-source candidate catalog")
    if pdf_path.is_symlink() or not pdf_path.is_file():
        raise ValueError("Refusing missing or symlinked PDF source")
    if pdf_path.stat().st_size > MAX_BYTES:
        raise ValueError("Official-source candidate exceeds the allowed file size")
    raw = pdf_path.read_bytes()
    if not raw.startswith(b"%PDF-") or len(raw) > MAX_BYTES:
        raise ValueError("Invalid or oversized blank SSA PDF candidate")
    digest = hashlib.sha256(raw).hexdigest()
    document = fitz.open(stream=raw, filetype="pdf")
    try:
        if document.needs_pass or not 1 <= len(document) <= MAX_PAGES:
            raise ValueError("Encrypted, empty, or unusually long source PDF")
        technology = form_technology(document)
        pages = []
        for page_index, page in enumerate(document):
            page_num = page_index + 1
            lines = []
            crop = page.rect
            # Sorting uses PDF geometry; preserve every visible text line even
            # when it does not match our provisional numbered-question pattern.
            for block in page.get_text("dict", sort=True).get("blocks", []):
                for line in block.get("lines", []):
                    spans = line.get("spans", [])
                    text = " ".join(str(span.get("text", "")) for span in spans).strip()
                    if not text:
                        continue
                    bbox = box(line["bbox"])
                    cue = NUMBERED_CUE.match(text)
                    number = cue.group(1) if cue else None
                    ordinal = len(lines) + 1
                    lines.append({
                        "item_id": stable_id(digest, page_num, "text", ordinal),
                        "page": page_num, "line_number": ordinal,
                        "text": text, "bbox": bbox,
                        "candidate_question_number": number,
                        "candidate_semantics": classification(text, number),
                        "at_crop_edge": near_crop_edge(bbox, crop),
                        "review_status": "UNREVIEWED", "human_reviewed": False,
                    })
            widgets = []
            for w in page.widgets() or []:
                if len(widgets) >= MAX_WIDGETS_PER_PAGE:
                    raise ValueError("Unusually high widget count; review source")
                ordinal = len(widgets) + 1
                kind = w.field_type_string or "Unknown"
                try:
                    states = (w.button_states() or {}).get("normal", []) \
                        if kind in ("CheckBox", "RadioButton") else []
                except (RuntimeError, ValueError, AttributeError):
                    states = []
                widgets.append({
                    "item_id": stable_id(digest, page_num, "widget", ordinal),
                    "page": page_num, "widget_number": ordinal,
                    "name": str(w.field_name or ""),
                    "kind": kind, "bbox": box(w.rect),
                    "on_states": states,
                    "review_status": "UNREVIEWED",
                    "approved_answer_key": None,
                    "reviewed_against_printed_question": False,
                })
            image_count = len(page.get_images(full=True))
            annotations = list(page.annots() or [])
            problems = []
            if not lines:
                problems.append("NO_EXTRACTABLE_PRINTED_TEXT")
            if image_count and not lines:
                problems.append("IMAGE_ONLY_PAGE_VISUAL_REVIEW_REQUIRED")
            if any(x["at_crop_edge"] for x in lines):
                problems.append("TEXT_NEAR_CROP_EDGE_REVIEW")
            if not widgets:
                problems.append("NO_INTERACTIVE_WIDGETS_CHECK_PRINTED_BLANKS")
            pages.append({
                "page": page_num,
                "size_points": [round(crop.width, 2), round(crop.height, 2)],
                "crop_box": box(crop),
                "image_count": image_count,
                "annotation_count": len(annotations),
                "text_found": bool(lines),
                "printed_lines": lines,
                "interactive_widgets": widgets,
                "page_review_flags": problems,
                "requires_image_review": not bool(lines) or bool(
                    "TEXT_NEAR_CROP_EDGE_REVIEW" in problems
                ),
            })
        warnings = []
        expected = EXPECTED_PAGES[form_id]
        if expected and len(pages) != expected:
            warnings.append(
                f"PAGE_COUNT_CHANGED: previously observed {expected}; found {len(pages)}"
            )
        if technology.get("xfa"):
            warnings.append("XFA_FORM_MAY_HAVE_FIELDS_NOT_VISIBLE_IN_ACROFORM_WIDGETS")
        if not technology.get("acroform"):
            warnings.append("NO_ACROFORM_FIELDS: inspect printed blanks and possible XFA")
        if any(p["page_review_flags"] for p in pages):
            warnings.append("PAGE_VISUAL_REVIEW_REQUIRED")
        return {
            "inventory_schema_version": 2, "form_id": form_id,
            "source_filename": pdf_path.name,
            "official_source_url": FORM_URLS[form_id],
            "source_sha256": digest,
            "source_bytes": len(raw),
            "source_pages": len(pages),
            "pdf_technology": technology,
            "expected_page_count_advisory": expected,
            "printed_line_count": sum(len(p["printed_lines"]) for p in pages),
            "candidate_numbered_line_count": sum(
                sum(bool(x["candidate_question_number"]) for x in p["printed_lines"])
                for p in pages),
            "interactive_widget_count": sum(
                len(p["interactive_widgets"]) for p in pages),
            "signature_witness_candidate_count": sum(
                sum("signature_or_witness_candidate" in x["candidate_semantics"]
                    for x in p["printed_lines"]) for p in pages),
            "missing_machine_readable_pages": [
                p["page"] for p in pages if not p["text_found"]],
            "pages_requiring_visual_review": [
                p["page"] for p in pages if p["requires_image_review"]],
            "warnings": warnings,
            "source_verification": "LOCAL_FILE_ONLY_OFFICIAL_EDITION_NOT_VERIFIED",
            "mapping_status": "UNREVIEWED_CANDIDATES_ONLY",
            "complete_question_coverage": False,
            "approved_for_pdf_population": False,
            "pages": pages,
        }
    finally:
        document.close()


def audit_dir(folder: Path) -> dict:
    result = {
        "inventory_schema_version": 2,
        "status": "UNREVIEWED_SOURCE_CANDIDATES_NOT_SSA_READY",
        "forms": {}, "missing": [], "errors": {},
        "disclaimer": "Complete local machine inventory is not a verified SSA field crosswalk.",
    }
    for form_id, filename in FORM_CATALOG.items():
        source = folder / filename
        if not source.is_file():
            result["missing"].append(form_id)
            continue
        try:
            result["forms"][form_id] = inspect_blank(source, form_id)
        except (OSError, ValueError, RuntimeError, fitz.FileDataError) as exc:
            result["errors"][form_id] = str(exc)
    return result


def review_queue_rows(inventory):
    """Generate a lossless row for every extracted line and every PDF widget."""
    for form_id, form in inventory["forms"].items():
        for page in form["pages"]:
            for line in page["printed_lines"]:
                yield {
                    "form_id": form_id,
                    "source_sha256": form["source_sha256"],
                    "item_id": line["item_id"],
                    "item_type": "printed_line", "page": page["page"],
                    "subindex": line["line_number"],
                    "candidate_question_number": line["candidate_question_number"] or "",
                    "candidate_semantics": "|".join(line["candidate_semantics"]),
                    "text_or_widget": line["text"], "pdf_widget_kind": "",
                    "widget_on_states": "", "bbox": json.dumps(line["bbox"]),
                    "review_status": "UNREVIEWED", "approved_canonical_key": "",
                    "reviewer": "", "reviewed_at_utc": "", "review_notes": "",
                }
            for widget in page["interactive_widgets"]:
                yield {
                    "form_id": form_id,
                    "source_sha256": form["source_sha256"],
                    "item_id": widget["item_id"], "item_type": "pdf_widget",
                    "page": page["page"], "subindex": widget["widget_number"],
                    "candidate_question_number": "", "candidate_semantics": "",
                    "text_or_widget": widget["name"],
                    "pdf_widget_kind": widget["kind"],
                    "widget_on_states": json.dumps(widget["on_states"]),
                    "bbox": json.dumps(widget["bbox"]),
                    "review_status": "UNREVIEWED", "approved_canonical_key": "",
                    "reviewer": "", "reviewed_at_utc": "", "review_notes": "",
                }


def write_review_queue(inventory, path):
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=QUEUE_COLUMNS)
        writer.writeheader()
        writer.writerows(review_queue_rows(inventory))


def compare_baseline(inventory, baseline):
    """A different official source digest always invalidates prior review."""
    previous = baseline.get("forms", {})
    changes = []
    for form_id in FORM_CATALOG:
        now = inventory["forms"].get(form_id)
        old = previous.get(form_id)
        if now is None or old is None:
            changes.append({"form_id": form_id, "change": "SOURCE_MISSING_IN_ONE_SNAPSHOT"})
        elif old.get("source_sha256") != now.get("source_sha256"):
            changes.append({"form_id": form_id, "change": "SOURCE_CHANGED_REAUDIT_REQUIRED",
                            "old_sha256": old.get("source_sha256"),
                            "new_sha256": now.get("source_sha256")})
        elif old.get("source_pages") != now.get("source_pages"):
            changes.append({"form_id": form_id, "change": "PAGE_COUNT_INCONSISTENT"})
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template-dir", type=Path,
                        default=Path(".local/ssa-templates"))
    parser.add_argument("--output", type=Path,
                        default=Path(".local/ssa-templates/all-form-field-inventory.json"))
    parser.add_argument("--review-queue", type=Path, default=None,
                        help="A CSV of every printed line and widget, marked UNREVIEWED")
    parser.add_argument("--compare-baseline", type=Path, default=None,
                        help="Prior generated JSON; changed source hashes require reaudit")
    args = parser.parse_args()
    inventory = audit_dir(args.template_dir)
    if args.compare_baseline:
        baseline = json.loads(args.compare_baseline.read_text(encoding="utf-8"))
        inventory["source_version_changes"] = compare_baseline(inventory, baseline)
    queue_path = args.review_queue or args.output.with_name("ssa-source-review-queue.csv")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    queue_path.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(inventory, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_review_queue(inventory, queue_path)
    for form_id, form in inventory["forms"].items():
        print(f"{form_id}: {form['source_pages']} pages; "
              f"{form['interactive_widget_count']} widgets; "
              f"{form['candidate_numbered_line_count']} numbered-line candidates;"
              f" {len(form['pages_requiring_visual_review'])} pages flagged.")
    print("Missing:", ", ".join(inventory["missing"]) or "none")
    print("Errors:", inventory["errors"])
    print("Review inventory:", args.output)
    print("Unreviewed source work queue:", queue_path)
    print("NOT a completed SSA field crosswalk, verified official edition or filing packet.")
    if inventory["missing"] or inventory["errors"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
