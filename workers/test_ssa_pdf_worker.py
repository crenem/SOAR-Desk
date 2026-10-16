"""Regression tests for the synthetic-only SSA-16 binding allowlist."""
import copy
import unittest

from ssa_pdf_worker import BOOLEAN, CHOICES, TEXT, mapped_answers


def sample():
    return {
        "file_kind":"soar-desk-synthetic-application-draft",
        "schema_version":1,
        "synthetic_only":True,
        "case_reference":"SYN-JANE-001",
        "summary":{"ready_for_ssa_submission":False},
        "forms":[{
            "form_id":"SSA-16","edition":"09-2025","reference_only":False,
            "sections":[{"questions":[
                {"key":"person.name","answer":"Jane Q Doe","review":"reported"},
                {"key":"ssdi.citizen","answer":"yes","review":"verified"},
                {"key":"ssdi.vision","answer":"no","review":"reported"},
                {"key":"work.onset","answer":"03/12/2024","review":"reported"},
                {"key":"person.ssn","answer":None,"review":"not_asked"},
                {"key":"ssdi.depositDetails","answer":"Fake account number","review":"reported"},
                {"key":"ssdi.signatureStatus","answer":"signed_on_paper","review":"reported"},
                {"key":"ssdi.signDate","answer":"11/14/2026","review":"reported"},
            ]}]
        }]
    }


class SsaPdfBindingTests(unittest.TestCase):
    def test_explicit_safe_mapping(self):
        result=mapped_answers(sample())
        self.assertEqual(result["person.name"],"Jane Q Doe")
        self.assertEqual(result["ssdi.citizen"],"yes")
        self.assertEqual(result["ssdi.vision"],"no")
        self.assertNotIn("person.ssn",result)
        self.assertNotIn("ssdi.depositDetails",result)
        self.assertNotIn("ssdi.signatureStatus",result)
        self.assertNotIn("ssdi.signDate",result)

    def test_no_protected_fields_in_mapping(self):
        all_fields=list(TEXT.values())+[f for pair in BOOLEAN.values() for f in pair]
        all_fields += [f for group in CHOICES.values() for f in group.values()]
        for name in all_fields:
            self.assertNotIn("Signature",name)
            self.assertNotIn("Witness",name)
            self.assertNotIn("Routing",name)
            self.assertNotIn("AccountNumber",name)
            self.assertNotIn("SSClaimNumber",name)

    def test_missing_or_unknown_answers_remain_blank(self):
        obj=sample()
        obj["forms"][0]["sections"][0]["questions"][0]["review"]="unknown"
        obj["forms"][0]["sections"][0]["questions"][1]["review"]="clarify"
        result=mapped_answers(obj)
        self.assertNotIn("person.name",result)
        self.assertNotIn("ssdi.citizen",result)
        self.assertEqual(result["work.onset"],"03/12/2024")

    def test_invalid_or_edited_templates_dont_match(self):
        obj=sample()
        obj["forms"][0]["edition"]="07-2023"
        with self.assertRaises(ValueError): mapped_answers(obj)
        obj=sample()
        obj["summary"]["ready_for_ssa_submission"]=True
        with self.assertRaises(ValueError): mapped_answers(obj)
        obj=sample()
        obj["case_reference"]="LIVE-CASE"
        with self.assertRaises(ValueError): mapped_answers(obj)
        obj=sample()
        obj["synthetic_only"]=False
        with self.assertRaises(ValueError): mapped_answers(obj)

    def test_restricted_local_working_pdf_allowlist(self):
        obj=sample()
        obj["file_kind"]="soar-desk-local-application-draft"
        obj["schema_version"]=2
        obj["synthetic_only"]=False
        obj["case_reference"]="CASE-12345678-abcd-ef12-1234-123456789abc"
        result=mapped_answers(obj)
        self.assertEqual(result["person.name"],"Jane Q Doe")
        self.assertNotIn("ssdi.signatureStatus",result)
        self.assertNotIn("ssdi.depositDetails",result)
        obj["case_reference"]="Jane-Doe-SSN-123456789"
        with self.assertRaises(ValueError): mapped_answers(obj)
        obj["file_kind"]="soar-desk-synthetic-application-draft"
        with self.assertRaises(ValueError): mapped_answers(obj)

    def test_invalid_question_values_rejected(self):
        obj=sample()
        obj["forms"][0]["sections"][0]["questions"][1]["answer"]="TRUE"
        with self.assertRaises(ValueError): mapped_answers(obj)
        obj=sample()
        obj["forms"][0]["sections"][0]["questions"][0]["answer"]="Jane\x00Doe"
        with self.assertRaises(ValueError): mapped_answers(obj)


if __name__=="__main__":
    unittest.main()
