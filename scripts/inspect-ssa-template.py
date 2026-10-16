#!/usr/bin/env python3
"""Audit a BLANK official SSA PDF template's interactive widgets.
No applicant data. Use this manifest to verify future field bindings.
"""
import argparse
import hashlib
import json
from pathlib import Path
import fitz

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("template",type=Path)
    parser.add_argument("--expected",required=True,help="Exact edition header to verify, e.g. SSA-3368-BK (06-2024)")
    args=parser.parse_args()
    raw=args.template.read_bytes()
    if not raw.startswith(b"%PDF-") or len(raw)>25_000_000:
        raise SystemExit("Invalid or oversized official template")
    pdf=fitz.open(stream=raw,filetype="pdf")
    first=pdf[0].get_text()
    if args.expected not in first:
        raise SystemExit("Unexpected source edition/header; refusing widget audit")
    pages=[]
    for n,page in enumerate(pdf):
        fields=[]
        for w in page.widgets() or []:
            fields.append({
                "name":w.field_name,
                "kind":w.field_type_string,
                "rect":[round(v,3) for v in w.rect],
                "on_states":w.button_states().get("normal",[]) if w.field_type_string=="CheckBox" else [],
            })
        pages.append({"page":n+1,"widgets":fields})
    report={
        "source_file":args.template.name,
        "source_sha256":hashlib.sha256(raw).hexdigest(),
        "source_edition_header":args.expected,
        "page_count":len(pdf),
        "interactive_widget_count":sum(len(p["widgets"]) for p in pages),
        "pages":pages,
    }
    print(json.dumps(report,indent=2))
if __name__=="__main__":
    main()
