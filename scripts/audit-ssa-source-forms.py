#!/usr/bin/env python3
"""Inventory every *visible* printed line and interactive widget in cached BLANK SSA PDFs.

This produces review candidates, not validated question equivalence or working
PDF mappings. A human must confirm conditional logic, meaning, continuation,
edition and question-to-widget positions against the original official PDFs.
No case/client data and no network access are used by this tool.
"""
import argparse
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
# A numbered-question pattern is a discovery aid, not authoritative parsing.
NUMBERED_CUE = re.compile(r"^\s*(?:(?:ITEM|PART|SECTION)\s+)?(\d{1,3}(?:[.][A-Za-z0-9]{1,3}){0,3})\s*[.):-]?\s+", re.I)
MAX_BYTES = 26 * 1024 * 1024

def inspect_blank(pdf_path: Path, form_id: str) -> dict:
    if pdf_path.is_symlink():
        raise ValueError("Refusing symlinked PDF source")
    raw = pdf_path.read_bytes()
    if not raw.startswith(b"%PDF-") or len(raw) > MAX_BYTES:
        raise ValueError("Source is not a supported blank SSA PDF")
    document = fitz.open(stream=raw, filetype="pdf")
    try:
        if document.needs_pass:
            raise ValueError("Encrypted SSA template is unsupported")
        pages = []
        for index, page in enumerate(document):
            page_num = index + 1
            lines = []
            for block in page.get_text("dict").get("blocks", []):
                if "lines" not in block:
                    continue
                for line in block["lines"]:
                    text = " ".join(span.get("text", "") for span in line["spans"]).strip()
                    if not text:
                        continue
                    bounds = [round(v, 2) for v in line["bbox"]]
                    match = NUMBERED_CUE.match(text)
                    lines.append({
                        "page": page_num, "text": text, "bbox": bounds,
                        "candidate_question_number": match.group(1) if match else None,
                        "human_reviewed": False,
                    })
            widgets = []
            for w in page.widgets() or []:
                if len(widgets) > 500:
                    raise ValueError("Unusually large form widget count; review PDF")
                widgets.append({
                    "page": page_num, "name": w.field_name,
                    "kind": w.field_type_string,
                    "bbox": [round(v, 2) for v in w.rect],
                    "on_states": w.button_states().get("normal", []) if w.field_type_string=="CheckBox" else [],
                    "approved_answer_key": None,
                    "reviewed_against_printed_question": False,
                })
            pages.append({
                "page":page_num, "text_found":bool(lines),
                "printed_lines":lines, "interactive_widgets":widgets,
                "requires_image_review":not bool(lines),
            })
        return {
            "form_id":form_id, "source_filename":pdf_path.name,
            "source_sha256":hashlib.sha256(raw).hexdigest(),
            "source_pages":len(pages),
            "printed_line_count":sum(len(p["printed_lines"]) for p in pages),
            "candidate_numbered_line_count":sum(sum(1 for l in p["printed_lines"] if l["candidate_question_number"]) for p in pages),
            "interactive_widget_count":sum(len(p["interactive_widgets"]) for p in pages),
            "missing_machine_readable_pages":[p["page"] for p in pages if p["requires_image_review"]],
            "mapping_status":"UNREVIEWED_CANDIDATES_ONLY",
            "complete_question_coverage":False,
            "approved_for_pdf_population":False,
            "pages":pages,
        }
    finally:
        document.close()

def audit_dir(folder:Path) -> dict:
    report={"status":"INCOMPLETE_UNTIL_EACH_SOURCE_AND_FIELD_IS_HUMAN_REVIEWED",
            "source_dir":str(folder), "forms":{}, "missing":[], "errors":{}}
    for form_id,filename in FORM_CATALOG.items():
        source=folder/filename
        if not source.is_file():
            report["missing"].append(form_id)
            continue
        try:
            report["forms"][form_id]=inspect_blank(source,form_id)
        except (ValueError, OSError, RuntimeError) as exc:
            report["errors"][form_id]=str(exc)
    return report

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template-dir",type=Path,default=Path(".local/ssa-templates"))
    parser.add_argument("--output",type=Path,default=Path(".local/ssa-templates/all-form-field-inventory.json"))
    args=parser.parse_args()
    inventory=audit_dir(args.template_dir)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(inventory,indent=2,ensure_ascii=False),encoding="utf-8")
    for fid,item in inventory["forms"].items():
        print(f"{fid}: {item['source_pages']} pages; {item['interactive_widget_count']} widgets; "
              f"{item['candidate_numbered_line_count']} numbered line candidates (UNREVIEWED)")
    print("Missing:", ", ".join(inventory["missing"]) or "none")
    print("Errors:", inventory["errors"])
    print("Review-only JSON:", args.output)
    if inventory["missing"] or inventory["errors"]:
        print("Incomplete official source inventory: obtain/verify missing PDFs before approval.")
        raise SystemExit(2)

if __name__=="__main__":
    main()
