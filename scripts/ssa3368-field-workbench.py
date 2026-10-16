#!/usr/bin/env python3
"""Generate a source-checked SSA-3368 field-mapping workbench (NO form filling).

Uses the *blank official PDF downloaded locally*. The tool never guesses that a
widget is safe to populate, never promotes candidate pairs to approved status,
and never handles case data. Compare the numbered PNG overlays with the PDF.
"""
import argparse
import hashlib
import json
from pathlib import Path
import fitz

FORM_MARKER="SSA-3368-BK (06-2024)"
FORM_PAGES=15
# Exact printed source-question cues from the June 2024 official report.
ANCHORS=[
 (3,"1.A","1.A. NAME","person.name","Text"),
 (3,"1.B","1.B. SOCIAL SECURITY NUMBER","person.ssn","Text"),
 (3,"1.C","1.C. Have you used any other names","person.othernames","CheckBox"),
 (3,"1.E","1.E. EMAIL ADDRESS","person.email","Text"),
 (3,"1.F","1.F. DAYTIME PHONE NUMBER","person.phone","Text"),
 (3,"1.G","1.G. Can you speak and understand English","person.englishSpeak","CheckBox"),
 (3,"1.H","1.H. Can you read and understand English","person.englishRead","CheckBox"),
 (3,"1.I","1.I. Can you write more than your name in English","person.englishWrite","CheckBox"),
 (4,"3.A","3.A. Separately list each physical","conditions","Text"),
 (4,"3.B","3.B. What is your height","medical.height","Text"),
 (4,"3.C","3.C. What is your weight","medical.weight","Text"),
 (4,"4.A","4.A. Are you currently working","work.current","CheckBox"),
 (4,"4.B","4.B. When do you believe your conditions","ssa3368.neverOnset","Text"),
 (4,"4.C","4.C. When did you stop working","work.stop","Text"),
 (5,"4.D","4.D. Did your condition(s) cause","ssa3368.stoppedChanges","CheckBox"),
 (5,"4.E","4.E. Since the date in 4.D.","ssa3368.stoppedEarnings","CheckBox"),
 (5,"4.F","4.F. Has your condition(s) caused","ssa3368.currentChanges","CheckBox"),
 (5,"4.G","4.G. Since your condition(s) first","ssa3368.currentEarnings","CheckBox"),
 (6,"6.A","6.A. Did you have a job","work.any","CheckBox")
]

def build(template:Path,out_dir:Path,render_pages:int)->dict:
    raw=template.read_bytes()
    if not raw.startswith(b"%PDF-") or len(raw)>25_000_000:
        raise ValueError("Invalid/oversized official SSA PDF")
    out_dir.mkdir(parents=True,exist_ok=True)
    with fitz.open(stream=raw,filetype="pdf") as doc:
        if len(doc)!=FORM_PAGES or FORM_MARKER not in doc[0].get_text():
            raise ValueError("Unexpected source document, edition or page count")
        observations=[]
        widgets_by_page={}
        for n,p in enumerate(doc):
            items=[]
            for index,w in enumerate(p.widgets() or []):
                items.append({
                    "number":index+1,
                    "name":w.field_name,
                    "type":w.field_type_string,
                    "page":n+1,
                    "rect":[round(v,1) for v in w.rect],
                    "on_states": w.button_states().get("normal",[]) if w.field_type_string=="CheckBox" else [],
                })
            widgets_by_page[n+1]=items
        for page_num,ref,cue,key,kind in ANCHORS:
            p=doc[page_num-1]
            matches=p.search_for(cue)
            target=matches[0] if matches else None
            candidates=[]
            if target is not None:
                for widget in widgets_by_page[page_num]:
                    if widget["type"]!=kind:continue
                    x0,y0,x1,y1=widget["rect"]
                    # Only a proximity ranking, NEVER an approved or verified match.
                    separation=max(0,y0-target.y1,target.y0-y1)
                    xgap=max(0,x0-target.x1,target.x0-x1)
                    score=round(separation + .25*xgap,2)
                    candidates.append({"name":widget["name"],"page":page_num,"type":widget["type"],
                                       "rect":widget["rect"],"proximity_score":score})
            candidates.sort(key=lambda w:w["proximity_score"])
            observations.append({
                "form_item":ref,"answer_key":key,"expected_kind":kind,"anchor_text":cue,
                "anchor_found":target is not None,"source_page":page_num,
                "suggested_candidates":candidates[:5],
                "approved":False,
                "approved_widget":None,
                "approval_note":"Unverified. Check form meaning and widget appearance in rendered source."
            })
        if render_pages:
            for page_index in range(min(render_pages,len(doc))):
                p=doc[page_index]
                overlay=fitz.open()
                try:
                    overlay.insert_pdf(doc,from_page=page_index,to_page=page_index)
                    target=overlay[0]
                    for w in widgets_by_page[page_index+1]:
                        rect=fitz.Rect(w["rect"])
                        target.draw_rect(rect,color=(.8,0,.1),width=.7,overlay=True)
                        target.insert_text(fitz.Point(rect.x0,max(9,rect.y0-3)),
                            "#"+str(w["number"]),fontsize=6,color=(.7,0,0),overlay=True)
                    pix=target.get_pixmap(matrix=fitz.Matrix(1.6,1.6),alpha=False)
                    pix.save(str(out_dir / f"ssa3368-widgets-p{page_index+1:02}.png"))
                finally: overlay.close()
    report={
      "status":"CANDIDATES_ONLY_NOT_APPROVED",
      "form_id":"SSA-3368-BK","edition":"06-2024",
      "source_sha256":hashlib.sha256(raw).hexdigest(),"source_page_count":FORM_PAGES,
      "widget_count":sum(len(w) for w in widgets_by_page.values()),
      "widget_inventory":widgets_by_page,
      "proposals":observations,
      "filling_enabled":False,
      "instructions":"Compare printed questions, widget bounds and on-states in source PDF and overlay PNGs. Do not autoapprove proximity suggestions."
    }
    (out_dir/"ssa3368-mapping-review.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    return report

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("template",type=Path)
    parser.add_argument("--out-dir",type=Path,required=True)
    parser.add_argument("--render-pages",type=int,default=7)
    args=parser.parse_args()
    result=build(args.template,args.out_dir,args.render_pages)
    print(f"Mapped {len(result['proposals'])} QUESTION CUES (not approved), "
          f"{result['widget_count']} widgets.")
    print(args.out_dir/"ssa3368-mapping-review.json")
if __name__=="__main__":
    main()
