"""Synthetic-only regression tests for SSA legal subject and timeframe routing."""
import copy
import importlib.util
import hashlib
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "semanticreview", ROOT/"scripts"/"verify-ssa-semantic-review.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

FORMS = ["SSA-16", "SSA-8000-BK", "SSA-8001-BK",
         "SSA-3368-BK", "SSA-827", "SSA-3369-BK", "SSA-3373-BK"]


def blank_form(form, pages):
    result = []
    for n in range(1, pages+1):
        result.append({"page": n, "printed_lines": [],
                       "interactive_widgets": []})
    return {"form_id":form,"source_sha256": hashlib.sha256(form.encode()).hexdigest(),
            "source_pages":pages, "interactive_widget_count":0,"pages":result,
            "pdf_technology":{"xfa":False}, "printed_edition_markers":[],
            "source_verification": "NO_DOWNLOAD_MANIFEST_OFFICIAL_SOURCE_UNCONFIRMED"}


def fixture():
    forms = {x:blank_form(x,10 if x=="SSA-3373-BK" else 1) for x in FORMS}
    entries = [
        ("SSA-3373-BK",3,"Name_FLD[0]","NAME OF DISABLED PERSON",
         "person.name", "person.name","benefits_claimant", "stable_identity",
         "verify same claimant", "applicable"),
        ("SSA-3373-BK",10,"Name_FLD[0]","Name of person completing this form",
         "person.name","report.ssa3373.completer.name","person_completing_report",
         "report_completion","do not merge","applicable"),
        ("SSA-827",1,"P1_Name1_FLD[0]","Whose Records to be Disclosed",
         "person.name","authorization.ssa827.records_subject.name",
         "records_subject","authorization_scope","no unverified bridge","authorization scope"),
        ("SSA-8000-BK",1,"P1_Q2Address_FLD[0]","Applicant's Mailing Address",
         "person.mailing.street","ssi.application.mailing.street",
         "ssi_application_mail_addressee","ssi_filing_workflow","link only if verified","verify applicant"),
        ("SSA-16",1,"N3Speak_FLD[0]","language you prefer to:",
         "person.preferred_language.spoken","person.preferred_language.spoken",
         "benefits_claimant","current_preference","conditional",
         "SSA-16 item 3 is asked only when English is not preferred"),
    ]
    concepts = {}
    seeds, reviews = [], []
    for i,(form,page,leaf,cue,orig,target,subject,time,reuse,when) in enumerate(entries):
        p = forms[form]["pages"][page-1]
        p["printed_lines"].append({"text":cue})
        p["interactive_widgets"].append({"name":f"t.{leaf}","kind":"Text",
                                          "review_status":"UNREVIEWED","item_id":str(i)})
        forms[form]["interactive_widget_count"] += 1
        seeds.append({"form_id":form,"page":page,"widget_leaf":leaf,
                      "canonical_key":orig, "source_cue":cue})
        concepts[target]={"subject":subject,"time_basis":time,"reuse_policy":reuse}
        reviews.append({"form_id":form,"page":page,"widget_leaf":leaf,
                        "source_cue":cue,"original_seed_key":orig,
                        "proposed_semantic_key":target,"subject":subject,
                        "time_basis":time,"reuse_policy":reuse,
                        "apply_when":when,"source_inspection":"printed source page inspected",
                        "status":m.REVIEW_ONLY,"pdf_population_approved":False})
    inventory={"forms":forms,"missing":[],"errors":{}}
    seed={"candidates":seeds}
    review={"schema_version":1,"status":"PROVISIONAL_NOT_APPROVED_FOR_PDF",
            "auto_approval":False, "concepts":concepts,"field_reviews":reviews,
            "critical_non_equivalences":[]}
    return inventory,seed,review


class SemanticReviewTests(unittest.TestCase):
    def test_valid_provisional_review_is_never_filling_permission(self):
        inv,seeds,reviews=fixture()
        result=m.verify(inv,seeds,reviews)
        self.assertEqual(result["summary"]["provisional_semantically_reviewed_widgets"],5)
        self.assertEqual(result["summary"]["safe_for_pdf_population"],0)
        self.assertEqual(result["summary"]["independently_approved"],0)
        with tempfile.TemporaryDirectory() as folder:
            out=m.write_results(result, Path(folder))
            self.assertTrue(out.exists())
            self.assertIn("PROVISIONAL", (Path(folder)/"ssa-semantic-review-batch1.json").read_text())

    def test_preparer_can_never_become_claimant(self):
        i,s,r=fixture()
        row=r["field_reviews"][1]
        row["proposed_semantic_key"]="person.name"
        row["subject"]="benefits_claimant"
        row["time_basis"]="stable_identity"
        row["reuse_policy"]="verify same claimant"
        with self.assertRaisesRegex(ValueError,"preparer name"):
            m.verify(i,s,r)

    def test_827_subject_is_not_signer_or_claimant(self):
        i,s,r=fixture()
        row=r["field_reviews"][2]
        row["proposed_semantic_key"]="person.name"
        row["subject"]="benefits_claimant"
        row["time_basis"]="stable_identity"
        row["reuse_policy"]="verify same claimant"
        with self.assertRaisesRegex(ValueError,"records subject incorrectly"):
            m.verify(i,s,r)

    def test_ssi_mailing_is_not_automatic_claimant_residence(self):
        i,s,r=fixture()
        row=r["field_reviews"][3]
        row["proposed_semantic_key"]="person.name"
        row["subject"]="benefits_claimant"
        row["time_basis"]="stable_identity"
        row["reuse_policy"]="verify same claimant"
        with self.assertRaisesRegex(ValueError,"applicant mailing"):
            m.verify(i,s,r)

    def test_16_preferred_language_conditional_is_enforced(self):
        i,s,r=fixture()
        r["field_reviews"][4]["apply_when"]="always"
        with self.assertRaisesRegex(ValueError,"conditional language"):
            m.verify(i,s,r)

    def test_reviewer_cannot_mark_pdf_ready_by_flag(self):
        i,s,r=fixture()
        r["field_reviews"][0]["pdf_population_approved"]=True
        with self.assertRaisesRegex(ValueError,"not final PDF approvals"):
            m.verify(i,s,r)

    def test_page_source_cue_integrity_enforced(self):
        i,s,r=fixture()
        i["forms"]["SSA-3373-BK"]["pages"][9]["printed_lines"][0]["text"]="different preparer wording"
        with self.assertRaisesRegex(ValueError,"cue not found"):
            m.verify(i,s,r)

    def test_conflicting_concept_subject_rejected(self):
        i,s,r=fixture()
        r["field_reviews"][0]["subject"]="some_other_person"
        with self.assertRaisesRegex(ValueError,"Conflicting subject"):
            m.verify(i,s,r)

    def test_removed_review_or_duplicate_rejected(self):
        i,s,r=fixture()
        r["field_reviews"].pop()
        with self.assertRaisesRegex(ValueError,"Every candidate"):
            m.verify(i,s,r)

    def test_fail_closed_when_source_form_missing(self):
        i,s,r=fixture()
        i["forms"].pop("SSA-827")
        with self.assertRaisesRegex(ValueError,"seven form"):
            m.verify(i,s,r)


if __name__ == "__main__":
    unittest.main()
