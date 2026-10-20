#!/usr/bin/env python3
"""Source-faithful question review ledger for every numbered SSA PDF cue.

All entries are UNREVIEWED. Printed question numbering, paragraph boundaries,
respondent, time windows and apparent branching are merely candidates; a
reviewer must inspect the exact official blank PDF. No PHI, AI or form filling.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

CSV_COLUMNS=[
    "form_id","source_sha256","page","source_line_item_id","source_bbox",
    "number_candidate","printed_question_line","nearby_instructions",
    "possible_conditional_words","candidate_timeframe_words",
    "source_edition_flags","respondent_verified","timeframe_verified",
    "applicability_verified","semantic_key_approved","human_disposition",
    "reviewer","reviewed_date","review_note"
]
CONDITIONAL_CUES=("if yes","if no","if applicable","if you","go to","otherwise",
                  "unless","only if","when","check one")
TIME_CUES=("before","after","since","last 5 years","filing date","at the time",
           "current","now","month","year","during","within")


def generate(inventory):
    if inventory.get("errors") or inventory.get("missing") or len(inventory.get("forms",{})) != 7:
        raise ValueError("All seven sources must be present and error-free")
    result=[]
    seen=set()
    for form,meta in inventory["forms"].items():
        for page in meta["pages"]:
            lines=page["printed_lines"]
            for i,item in enumerate(lines):
                number=item.get("candidate_question_number")
                if not number:
                    continue
                ref=(form,item["item_id"])
                if ref in seen:
                    raise ValueError("Duplicate printed line identity")
                seen.add(ref)
                # Adjacent lines may come from columns/tables, so the nearby
                # context is a provisional visual aid, not joined prompt text.
                nearby=" | ".join(l["text"][:140] for l in lines[i+1:i+4])
                check=(item["text"]+" "+nearby).casefold()
                result.append({
                    "form_id":form,"source_sha256":meta["source_sha256"],
                    "page":page["page"],
                    "source_line_item_id":item["item_id"],
                    "source_bbox":json.dumps(item["bbox"]),
                    "number_candidate":number,
                    "printed_question_line":item["text"],
                    "nearby_instructions":nearby,
                    "possible_conditional_words":" | ".join(w for w in CONDITIONAL_CUES if w in check),
                    "candidate_timeframe_words":" | ".join(w for w in TIME_CUES if w in check),
                    "source_edition_flags":" | ".join(meta.get("warnings", [])),
                    "respondent_verified":"",
                    "timeframe_verified":"",
                    "applicability_verified":"",
                    "semantic_key_approved":"",
                    "human_disposition":"UNREVIEWED_CANDIDATE",
                    "reviewer":"","reviewed_date":"","review_note":"",
                })
    expected=sum(v["candidate_numbered_line_count"] for v in inventory["forms"].values())
    if len(result)!=expected:
        raise ValueError(f"Found {len(result)} but source inventory lists {expected} numbered candidates")
    return result


def write(inventory, path):
    rows=generate(inventory)
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("w",encoding="utf-8",newline="") as stream:
        writer=csv.DictWriter(stream,fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--inventory",type=Path,required=True)
    ap.add_argument("--out",type=Path,
                    default=Path(".local/ssa-templates/ssa-numbered-question-review.csv"))
    args=ap.parse_args()
    inventory=json.loads(args.inventory.read_text(encoding="utf-8"))
    count=write(inventory,args.out)
    print(f"{count} numbered-line REVIEW CANDIDATES written to {args.out}.")
    print("No item is approved, and numbering alone does not establish question completeness.")


if __name__=="__main__":
    main()
