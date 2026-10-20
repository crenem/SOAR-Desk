"""No-PHI tests: source-bound question ledger does not auto-approve cues."""
import csv
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location(
    "questionledger",ROOT/"scripts"/"build-ssa-question-review-ledger.py")
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture():
    forms={}
    for n,form in enumerate(["SSA-16","SSA-8000-BK","SSA-8001-BK",
                              "SSA-3368-BK","SSA-827","SSA-3369-BK","SSA-3373-BK"]):
        question={"item_id":f"f{n}item1","candidate_question_number":"1",
                  "text":"1. When was the fictional event?",
                  "bbox":[10,10,90,26]}
        second={"item_id":f"f{n}item2","candidate_question_number":None,
                "text":"If YES, go to 2; since the first moment of the filing date month",
                "bbox":[10,29,400,50]}
        forms[form]={"source_sha256":("a" if n%2 else "b")*64,
                    "pages":[{"page":1,"printed_lines":[question,second]}],
                    "warnings":[],"candidate_numbered_line_count":1}
    return {"forms":forms,"missing":[],"errors":{}}


class LedgerTests(unittest.TestCase):
    def test_all_numbered_source_lines_remain_unreviewed(self):
        result=m.generate(fixture())
        self.assertEqual(len(result),7)
        self.assertTrue(all(x["human_disposition"]=="UNREVIEWED_CANDIDATE" for x in result))
        self.assertTrue(all(not x["semantic_key_approved"] for x in result))
        self.assertTrue(all("filing date" in x["nearby_instructions"] for x in result))
        self.assertTrue(all("if yes" in x["possible_conditional_words"] for x in result))
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/"review.csv"
            self.assertEqual(m.write(fixture(),out),7)
            with out.open(newline="",encoding="utf-8") as f:
                data=list(csv.DictReader(f))
            self.assertEqual(len(data),7)
            self.assertEqual(data[0]["respondent_verified"],"")

    def test_missing_source_fails_closed(self):
        inp=fixture()
        inp["missing"].append("SSA-827")
        with self.assertRaisesRegex(ValueError,"all seven sources|All seven sources"):
            m.generate(inp)

    def test_duplicate_source_line_id_fails(self):
        inp=fixture()
        inp["forms"]["SSA-16"]["pages"][0]["printed_lines"].append(
            inp["forms"]["SSA-16"]["pages"][0]["printed_lines"][0])
        inp["forms"]["SSA-16"]["candidate_numbered_line_count"]=2
        with self.assertRaisesRegex(ValueError,"Duplicate"):
            m.generate(inp)

    def test_inconsistent_numbered_source_total_fails(self):
        inp=fixture()
        inp["forms"]["SSA-16"]["candidate_numbered_line_count"]=4
        with self.assertRaisesRegex(ValueError,"source inventory lists"):
            m.generate(inp)


if __name__=="__main__":
    unittest.main()
