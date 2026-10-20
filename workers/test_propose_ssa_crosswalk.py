"""Synthetic-only source binding tests; official blank PDFs are gitignored."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "canonical_review", ROOT/"scripts"/"propose-ssa-crosswalk.py")
subject = importlib.util.module_from_spec(spec)
spec.loader.exec_module(subject)


def make_inventory():
    sha = hashlib.sha256(b"fictional form").hexdigest()
    pages = []
    for index, cue in enumerate(["1. NAME OF DISABLED PERSON",
                                  "Name of person completing this form"], start=1):
        pages.append({"page":index,
          "printed_lines":[{"item_id":f"t{index}", "text":cue}],
          "interactive_widgets":[{"item_id":f"w{index}",
            "name":f"form.Page{index}.Name_FLD[0]",
            "kind":"Text", "bbox":[1,2,3,4]}]})
    return {"missing":[],"errors":{},"forms":{"SSA-3373-BK":{
        "source_sha256":sha,"source_pages":2, "interactive_widget_count":2,
        "pages":pages,"printed_edition_markers":["SSA-3373-BK (08-2026)",
                                               "SSA-3373-BK (10-2026)"],
        "pdf_technology":{"xfa":True},
    }}}


class CandidateTests(unittest.TestCase):
    def test_same_widget_name_on_different_pages_is_not_same_person(self):
        catalog = {"candidates":[
           {"form_id":"SSA-3373-BK","page":1,"widget_leaf":"Name_FLD[0]",
            "canonical_key":"person.name","source_cue":"DISABLED PERSON",
            "subject":"applicant"},
           {"form_id":"SSA-3373-BK","page":2,"widget_leaf":"Name_FLD[0]",
            "canonical_key":"report.ssa3373.completer.name",
            "source_cue":"Name of person completing", "subject":"respondent"},
        ]}
        found = subject.seed_candidates(make_inventory(), catalog)
        self.assertEqual([x["canonical_key"] for x in found],
           ["person.name","report.ssa3373.completer.name"])
        self.assertTrue(all(not x["pdf_population_approved"] for x in found))

    def test_wrong_page_fails(self):
        fake = {"candidates":[{
            "form_id":"SSA-3373-BK","page":1,"widget_leaf":"Name_FLD[0]",
            "canonical_key":"person.name",
            "source_cue":"Name of person completing", "subject":"applicant"}]}
        with self.assertRaisesRegex(ValueError, "Printed cue"):
            subject.seed_candidates(make_inventory(), fake)

    def test_duplicate_mapping_fails(self):
        seed = {"form_id":"SSA-3373-BK","page":1,"widget_leaf":"Name_FLD[0]",
                "canonical_key":"person.name",
                "source_cue":"DISABLED PERSON", "subject":"applicant"}
        with self.assertRaisesRegex(ValueError, "Duplicate mapping"):
            subject.seed_candidates(make_inventory(), {"candidates":[seed,seed]})

    def test_hard_stop_for_nontext_widget(self):
        inventory = make_inventory()
        inventory["forms"]["SSA-3373-BK"]["pages"][0]["interactive_widgets"][0]["kind"]="CheckBox"
        seed = {"candidates":[{"form_id":"SSA-3373-BK","page":1,
           "widget_leaf":"Name_FLD[0]","canonical_key":"person.name",
           "source_cue":"DISABLED PERSON","subject":"applicant"}]}
        with self.assertRaisesRegex(ValueError, "Checkbox"):
            subject.seed_candidates(inventory,seed)

    def test_pdf_sha_mismatch_is_blocking(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/"synthetic.pdf"
            path.write_bytes(b"different fictional file")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                subject.verify_pdf_hashes(
                    make_inventory(),{"SSA-3373-BK":path},require=True)

    def test_no_source_file_is_never_verified(self):
        got=subject.verify_pdf_hashes(make_inventory(),{},require=False)
        self.assertEqual(got["SSA-3373-BK"],"NOT_CHECKED")
        with self.assertRaisesRegex(ValueError,"Missing SHA-bound"):
            subject.verify_pdf_hashes(make_inventory(),{},require=True)


if __name__ == "__main__":
    unittest.main()
