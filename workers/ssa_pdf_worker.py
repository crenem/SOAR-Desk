#!/usr/bin/env python3
"""SSA-16 PDF review copy (training or unsigned local working draft). Original untouched.

Requires PyMuPDF. No model inference, network call, signature, receipt, or
SSA-only field may be generated. Explicit, source-verified AcroForm/XFA names.
"""
from __future__ import annotations
import json
import hashlib
import os
import pathlib
import sys
import tempfile
import re
try:
    import fitz
except ImportError as exc:
    raise SystemExit("PyMuPDF required: .venv-laya/bin/python -m pip install 'pymupdf>=1.24,<1.27'") from exc

FORM = "SSA-16"
MARKER = "Form SSA-16 (09-2025)"
# Same vetted ORIGINAL BLANK federal PDF accepted by the native template installer.
EXPECTED_SHA256 = "09c088cbbf688b2e14a1061d2ff31cd481344de2ba5eacfac030f61045ba548e"
TEXT = {
    "person.name":"N1FLD_FLD[0]",
    "person.ssn":"N2FLD_FLD[0]",
    "person.writtenLanguage":"N3Write_FLD[0]",
    "person.dob":"N4A_FLD[0]",
    "person.birthplace":"N4B_FLD[0]",
    "ssdi.admitted":"N5C_FLD[0]",
    "person.birthName":"N6A_FLD[0]",
    "person.othernamesText":"N6C_FLD[0]",
    "ssdi.otherNumbers":"N7B_FLD[0]",
    "work.onset":"N8_FLD[0]",
    "ssdi.foreignCountry":"N10B_FLD[0]",
    "ssdi.uncoveredYears":"N13BFLD_text[0]",
    "ssdi.ableDate":"N17BFLD_FLD[0]",
    "ssdi.remarks":"RemarksFLD[0]",
    "person.phone":"Telephone_FLD[0]",
    "person.mail":"ApplicantsAddressFLD[0]",
}
BOOLEAN = {
    "ssdi.citizen":("N5ACBYes_CB[0]","N5ACBNo_CB[0]"),
    "ssdi.lawful":("N5BCBYes_CB[0]","N5BCBNo_CB[0]"),
    "person.othernames":("N6BCByes_CB[0]","N6BCB_CB[0]"),
    "ssdi.otherSSNs":("N7Ayes_CB[0]","N7Ano_CB[0]"),
    "ssdi.railroad":("N9yes_CB[0]","N9no_CB[0]"),
    "ssdi.foreignCredits":("N10Ayes_CB[0]","N10Ano_CB[0]"),
    "person.marriedEver":("N11AYes_CB[0]","N11ANo_CB[0]"),
    "ssdi.coveredAllYears":("N13yes_CB[0]","N13No_CB[0]"),
    "ssdi.selfEmployed":("N15yes_CB[0]","N15no_CB[0]"),
    "ssdi.stillUnable":("N17yes_CB[0]","N17no_CB[0]"),
    "ssdi.workRelated":("N18Yes_CB[0]","N18No_CB[0]"),
    "ssdi.vision":("N19Yes_CB[0]","N19No_CB[0]"),
    "ssdi.otherBenefits":("N20yes_CB[0]","N20No_CB[0]"),
    "ssdi.paidAfterOnset":("N21yes_CB[0]","N21no_CB[0]"),
    "ssdi.expectPay":("N21Byes_CB[0]","N21Bno_CB[0]"),
    "ssdi.childUnder3":("N22yes_CB[0]","N22no_CB[0]"),
    "ssdi.parentSupport":("N23yes_CB[0]","N23no_CB[0]"),
}
CHOICES = {"ssdi.before22":{"yes":"N24yes_CB[0]","no":"N24no_CB[0]","unknown":"N24unk_CB[0]"}}
# Never map signature, witness, bank account/routing, SSA-only fields or
# ambiguous compound questions until individually reviewed.

def mapped_answers(package:dict)->dict[str,str]:
    if not isinstance(package,dict):
        raise ValueError("SOAR Desk review draft required")
    training=package.get("synthetic_only") is True
    local=package.get("synthetic_only") is False
    kind=package.get("file_kind")
    if not (
        (training and kind=="soar-desk-synthetic-application-draft" and package.get("schema_version")==1)
        or (local and kind=="soar-desk-local-application-draft" and package.get("schema_version")==2)
    ):
        raise ValueError("Supported versioned working draft required")
    ref=package.get("case_reference")
    if not isinstance(ref,str) or len(ref)>80 or not (
        ref.startswith("SYN-") if training else
        re.fullmatch(r"CASE-[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}",ref) is not None
    ):
        raise ValueError("Opaque case identifier with matching mode required")
    if package.get("summary",{}).get("ready_for_ssa_submission") is not False:
        raise ValueError("Cannot render a package claiming submission readiness")
    forms=[f for f in package.get("forms",[]) if f.get("form_id")==FORM]
    if len(forms)!=1 or forms[0].get("edition")!="09-2025" or forms[0].get("reference_only"):
        raise ValueError("An SSA-16 (09-2025) mapped draft is required")
    answer={}
    for section in forms[0].get("sections",[]):
        for q in section.get("questions",[]):
            key,val,state=q.get("key"),q.get("answer"),q.get("review")
            if key not in TEXT and key not in BOOLEAN and key not in CHOICES:
                continue
            if state not in ("reported","verified") or not isinstance(val,str) or not val.strip():
                continue
            if len(val)>450 or any(ord(c)<32 and c not in "\n\t" for c in val):
                raise ValueError("Invalid value for "+str(key))
            if key in BOOLEAN and val not in ("yes","no"):
                raise ValueError("Invalid yes/no for "+key)
            if key in CHOICES and val not in CHOICES[key]:
                raise ValueError("Invalid choice for "+key)
            answer[key]=val.strip()
    return answer

def render(template:pathlib.Path,output:pathlib.Path,package:dict)->dict:
    answers=mapped_answers(package)
    template=template.resolve(strict=True)
    if template.stat().st_size>25_000_000:
        raise ValueError("Template is too large")
    if hashlib.sha256(template.read_bytes()).hexdigest()!=EXPECTED_SHA256:
        raise ValueError("SSA-16 template does not match the reviewed original blank 09-2025 edition")
    if not output.is_absolute() or output.suffix.lower()!=".pdf":
        raise ValueError("An absolute .pdf export path is required")
    if output.resolve()==template:
        raise ValueError("Original SSA form may not be overwritten")
    doc=fitz.open(str(template))
    try:
        if len(doc)!=7 or MARKER not in doc[0].get_text() or not doc.is_form_pdf:
            raise ValueError("Template is not the verified 7-page SSA-16 edition 09-2025")
        pages=[doc[i] for i in range(len(doc))]  # Keep widget parent pages alive.
        widgets={}
        for i,page in enumerate(pages):
            for w in page.widgets() or []:
                suffix=w.field_name.rsplit(".",1)[-1]
                if suffix in widgets:
                    raise ValueError("Duplicate field "+suffix)
                widgets[suffix]=(i,page,w)
        required=set(TEXT.values())|{s for pair in BOOLEAN.values() for s in pair}
        required|={s for options in CHOICES.values() for s in options.values()}
        missing=required-widgets.keys()
        if missing:
            raise ValueError("SSA-16 widget layout changed: "+", ".join(sorted(missing)[:4]))
        expected={}
        for key,value in answers.items():
            if key in TEXT:
                suffix=TEXT[key]
                idx,_,widget=widgets[suffix]
                if widget.field_type_string!="Text" or idx>4:
                    raise ValueError("Text field changed: "+suffix)
                widget.field_value=value
                widget.text_fontsize=8 if len(value)>55 else 10
                expected[key]=value
            else:
                suffix=(BOOLEAN[key][0 if value=="yes" else 1]
                        if key in BOOLEAN else CHOICES[key][value])
                idx,_,widget=widgets[suffix]
                if widget.field_type_string!="CheckBox" or idx>3:
                    raise ValueError("Checkbox changed: "+suffix)
                states=widget.button_states()["normal"]
                if len(states)!=1:
                    raise ValueError("Unknown checkbox appearance: "+suffix)
                widget.field_value=states[0]
                expected[key]=states[0]
            widget.update()
        training=package.get("synthetic_only") is True
        watermark=("SYNTHETIC TRAINING DRAFT" if training
                   else "UNSIGNED - INCOMPLETE WORKING DRAFT")
        footer=("SOAR DESK TRAINING ONLY - NOT FOR SSA SUBMISSION" if training
                else "UNSIGNED WORKING DRAFT - REVIEW ALL ANSWERS, COMPLETE GAPS AND SIGN")
        for page in pages:
            page.insert_textbox(fitz.Rect(35,300,page.rect.width-25,575),
                watermark,fontsize=18 if not training else 26,fontname="helv",
                color=(.75,.05,.05),fill_opacity=.12,align=1,overlay=True)
            page.insert_text((42,page.rect.height-4),
                footer,fontsize=6.5,fontname="helv",color=(.7,.08,.08),overlay=True)
        if not output.parent.is_dir():
            raise ValueError("Export destination folder does not exist")
        with tempfile.NamedTemporaryFile(prefix=".soar-ssa16-",suffix=".pdf",
                                         dir=output.parent,delete=False) as temp:
            temporary=pathlib.Path(temp.name)
        try:
            doc.save(str(temporary),garbage=3,deflate=True,encryption=fitz.PDF_ENCRYPT_NONE)
            check=fitz.open(str(temporary))
            try:
                if len(check)!=7:
                    raise ValueError("Generated PDF has wrong number of pages")
                verified_pages=[check[i] for i in range(len(check))]
                for key,value in answers.items():
                    suffix=(TEXT[key] if key in TEXT else
                            BOOLEAN[key][0 if value=="yes" else 1] if key in BOOLEAN else
                            CHOICES[key][value])
                    matching=[w for p in verified_pages for w in p.widgets() or []
                              if w.field_name.endswith("."+suffix)]
                    if len(matching)!=1 or matching[0].field_value!=expected[key]:
                        raise ValueError("Value did not survive PDF save: "+key)
            finally:
                check.close()
            os.link(temporary,output)  # Atomic no-overwrite; never clobber files.
        finally:
            temporary.unlink(missing_ok=True)
    finally:
        doc.close()
    return {"output":str(output),"form_id":FORM,"fields_populated":len(answers),
            "original_pages_preserved":7,"synthetic_only":package.get("synthetic_only"),
            "ready_for_ssa_submission":False}

def main()->None:
    data=sys.stdin.buffer.read(2_000_001)
    if len(data)>2_000_000:
        raise ValueError("Synthetic PDF request exceeds 2 MB")
    request=json.loads(data)
    training=request.get("package",{}).get("synthetic_only") is True
    if training:
        if request.get("synthetic_confirmed") is not True or request.get("local_risk_acknowledged") is True:
            raise ValueError("Explicit fictional-data acknowledgment required")
    elif request.get("package",{}).get("synthetic_only") is False:
        if request.get("local_risk_acknowledged") is not True or request.get("synthetic_confirmed") is True:
            raise ValueError("Restricted local case PDF export requires explicit authorization acknowledgment")
    else:
        raise ValueError("Unknown case mode")
    response=render(pathlib.Path(request["template_path"]),
                    pathlib.Path(request["output_path"]),request["package"])
    print(json.dumps(response))

if __name__=="__main__":
    try:
        main()
    except Exception as exc:
        print("Synthetic SSA PDF export: "+str(exc),file=sys.stderr)
        sys.exit(1)
