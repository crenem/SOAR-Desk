"""Synthetic-only tests for SSA blank-form printed-field inventory."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import fitz

ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location("form_audit",ROOT/"scripts"/"audit-ssa-source-forms.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SourceFormAuditTests(unittest.TestCase):
    def test_extracts_printed_numbered_question_and_detects_blank_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"ssa-16-bk.pdf"
            pdf=fitz.open()
            page=pdf.new_page()
            page.insert_text((30,30),"1.A. Applicant name")
            pdf.new_page()
            pdf.save(path)
            pdf.close()
            report=module.inspect_blank(path,"SSA-16")
            self.assertEqual(report["source_pages"],2)
            self.assertEqual(report["missing_machine_readable_pages"],[2])
            self.assertTrue(report["candidate_numbered_line_count"]>=1)
            self.assertEqual(report["mapping_status"],"UNREVIEWED_CANDIDATES_ONLY")
            self.assertFalse(report["approved_for_pdf_population"])
    def test_refuses_non_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"ssa-16-bk.pdf"
            p.write_text("not pdf")
            with self.assertRaises(ValueError):
                module.inspect_blank(p,"SSA-16")

if __name__=="__main__":
    unittest.main()
