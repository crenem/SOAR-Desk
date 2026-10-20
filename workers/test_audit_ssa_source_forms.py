"""Synthetic blank SSA-style PDF test fixtures. No external SSA/PDF downloads."""
import csv
import importlib.util
from pathlib import Path
import tempfile
import unittest

import fitz

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "form_audit", ROOT / "scripts" / "audit-ssa-source-forms.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def make_blank_pdf(path, label="1.A. Fictional applicant name", with_widget=False):
    pdf = fitz.open()
    first = pdf.new_page()
    first.insert_text((30, 35), label)
    first.insert_text((30, 85), "SIGNATURE OF CLAIMANT")
    first.insert_text((30, 135), "FOR SSA USE ONLY")
    first.insert_text((30, 180), "REMARKS: Attach additional pages")
    if with_widget:
        widget = fitz.Widget()
        widget.field_name = "fictional_applicant"
        widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
        widget.rect = fitz.Rect(30, 47, 240, 64)
        first.add_widget(widget)
    pdf.new_page()  # blank/scanned-page stand-in requiring image review
    pdf.save(path)
    pdf.close()


class SourceFormAuditTests(unittest.TestCase):
    def test_inventory_never_claims_ready_and_keeps_every_line(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ssa-16-bk.pdf"
            make_blank_pdf(path, with_widget=True)
            report = audit.inspect_blank(path, "SSA-16")
            self.assertEqual(report["inventory_schema_version"], 2)
            self.assertEqual(report["source_pages"], 2)
            self.assertEqual(report["interactive_widget_count"], 1)
            self.assertTrue(report["pdf_technology"]["acroform"])
            self.assertEqual(report["missing_machine_readable_pages"], [2])
            self.assertTrue(report["candidate_numbered_line_count"] >= 1)
            self.assertTrue(report["signature_witness_candidate_count"] >= 1)
            self.assertIn("FOR SSA USE ONLY",
                          " ".join(x["text"] for x in report["pages"][0]["printed_lines"]))
            self.assertTrue(report["pages"][1]["requires_image_review"])
            self.assertIn("PAGE_COUNT_CHANGED", " ".join(report["warnings"]))
            self.assertEqual(report["mapping_status"], "UNREVIEWED_CANDIDATES_ONLY")
            self.assertEqual(report["source_verification"],
                             "LOCAL_FILE_ONLY_OFFICIAL_EDITION_NOT_VERIFIED")
            self.assertFalse(report["complete_question_coverage"])
            self.assertFalse(report["approved_for_pdf_population"])
            for page in report["pages"]:
                for line in page["printed_lines"]:
                    self.assertEqual(line["review_status"], "UNREVIEWED")
                    self.assertEqual(len(line["item_id"]), 20)

    def test_idempotent_ids_and_sha_bound_versions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ssa-16-bk.pdf"
            make_blank_pdf(path, with_widget=True)
            first = audit.inspect_blank(path, "SSA-16")
            second = audit.inspect_blank(path, "SSA-16")
            self.assertEqual(first["source_sha256"], second["source_sha256"])
            self.assertEqual(first["pages"][0]["printed_lines"][0]["item_id"],
                             second["pages"][0]["printed_lines"][0]["item_id"])
            make_blank_pdf(path, label="2.A. Fictional applicant name NEW EDITION",
                           with_widget=True)
            changed = audit.inspect_blank(path, "SSA-16")
            comparison = audit.compare_baseline(
                {"forms": {"SSA-16": changed}}, {"forms": {"SSA-16": first}})
            self.assertEqual(comparison[0]["change"],
                             "SOURCE_CHANGED_REAUDIT_REQUIRED")
            self.assertNotEqual(first["pages"][0]["printed_lines"][0]["item_id"],
                                changed["pages"][0]["printed_lines"][0]["item_id"])

    def test_review_queue_has_every_printed_line_and_widget(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ssa-16-bk.pdf"
            make_blank_pdf(path, with_widget=True)
            source = audit.inspect_blank(path, "SSA-16")
            inventory = {"forms": {"SSA-16": source}}
            rows = list(audit.review_queue_rows(inventory))
            self.assertEqual(len(rows),
                             source["source_pages"] + source["printed_line_count"] + source["interactive_widget_count"])
            self.assertTrue(all(row["review_status"] == "UNREVIEWED" for row in rows))
            self.assertTrue(all(not row["approved_canonical_key"] for row in rows))
            self.assertTrue(all(row["source_sha256"] == source["source_sha256"]
                                for row in rows))
            queue_path = Path(directory) / "review.csv"
            audit.write_review_queue(inventory, queue_path)
            with queue_path.open(encoding="utf-8", newline="") as stream:
                parsed = list(csv.DictReader(stream))
            self.assertEqual(len(parsed), len(rows))
            self.assertEqual(len({row["item_id"] for row in parsed}), len(rows))
            self.assertTrue(any(row["item_type"] == "pdf_widget" for row in parsed))
            self.assertEqual(sum(row["item_type"] == "page_review" for row in parsed), 2)
            self.assertTrue(any(row["item_type"] == "page_review" and row["page"] == "2" for row in parsed))
            self.assertTrue(any("signature_or_witness_candidate"
                                in row["candidate_semantics"] for row in parsed))

    def test_incomplete_source_set_flags_missing_forms(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ssa-16-bk.pdf"
            make_blank_pdf(path)
            manifest = audit.audit_dir(Path(directory))
            self.assertIn("SSA-8000-BK", manifest["missing"])
            self.assertIn("SSA-16", manifest["forms"])
            self.assertFalse(manifest["forms"]["SSA-16"]["complete_question_coverage"])
            self.assertNotIn("source_dir", manifest)

    def test_download_manifest_corroborates_source_hash_and_url(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "ssa-16-bk.pdf"
            make_blank_pdf(path)
            file_hash = audit.hashlib.sha256(path.read_bytes()).hexdigest()
            (root / "manifest.tsv").write_text(
                "filename\tsha256\tbytes\tsource\n"
                f"ssa-16-bk.pdf\t{file_hash}\t{path.stat().st_size}\t"
                f"{audit.FORM_URLS['SSA-16']}\n", encoding="utf-8"
            )
            inventory = audit.audit_dir(root, require_download_manifest=True)
            self.assertTrue(inventory["missing"])  # other official forms absent
            self.assertNotIn("SSA-16", inventory["errors"])
            self.assertEqual(
                inventory["forms"]["SSA-16"]["source_verification"],
                "MATCHES_LOCAL_HTTPS_DOWNLOAD_MANIFEST_EDITION_NOT_VISUALLY_VERIFIED"
            )
            # Changing bytes without changing the download manifest is blocked.
            make_blank_pdf(path, label="2.A. Corrected fictional item")
            broken = audit.audit_dir(root, require_download_manifest=True)
            self.assertIn("SSA-16", broken["errors"])
            self.assertNotIn("SSA-16", broken["forms"])

    def test_require_manifest_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ssa-16-bk.pdf"
            make_blank_pdf(path)
            manifest = audit.audit_dir(Path(directory), require_download_manifest=True)
            self.assertIn("download_manifest", manifest["errors"])
            self.assertEqual(
                manifest["forms"]["SSA-16"]["source_verification"],
                "NO_DOWNLOAD_MANIFEST_OFFICIAL_SOURCE_UNCONFIRMED"
            )

    def test_invalid_pdf_symlink_and_unrecognized_form_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "ssa-16-bk.pdf"
            target.write_text("not pdf")
            with self.assertRaises(ValueError):
                audit.inspect_blank(target, "SSA-16")
            with self.assertRaises(ValueError):
                audit.inspect_blank(target, "SSA-UNKNOWN")
            link = Path(directory) / "link.pdf"
            link.symlink_to(target)
            with self.assertRaises(ValueError):
                audit.inspect_blank(link, "SSA-16")

    def test_blank_or_flattened_source_never_approved_by_widget_count(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ssa-827.pdf"
            make_blank_pdf(path)
            report = audit.inspect_blank(path, "SSA-827")
            self.assertEqual(report["interactive_widget_count"], 0)
            self.assertTrue(any("NO_ACROFORM_FIELDS" in flag for flag in report["warnings"]))
            self.assertFalse(report["complete_question_coverage"])
            self.assertFalse(report["approved_for_pdf_population"])


if __name__ == "__main__":
    unittest.main()
