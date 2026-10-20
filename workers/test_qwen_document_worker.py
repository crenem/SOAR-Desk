"""Offline tests for consolidated Qwen JSON and safe evidence provenance."""
import json
import unittest
import qwen_document_worker as worker

DIGEST = "a" * 64
def fake_infer(prompt, **kwargs):
    page = int(prompt.split("[PAGE ")[1].split("]")[0])
    body = prompt.split("\n", 1)[1]
    quote = "Jane Doe" if "Jane Doe" in body else body[:20]
    parsed = {"summary": "Proposed source description", "findings": [
        {"page": page, "category": "medical_history",
         "value": "Source records one observation", "quote": quote}],
         "field_suggestions":[{"page":page,"field_key":"person.name",
                               "value":"Jane Doe","quote":quote}]}
    return {"choices":[{"message":{"content":json.dumps(parsed)}}]}, "cpu", "qwen3-4b"

class WholeDocumentTests(unittest.TestCase):
    def test_single_json_for_multiple_pages_and_source_provenance(self):
        data={"sha256":DIGEST,"pages":[
            {"page":1,"text":"Patient: Jane Doe\nHad an appointment on 1/2/2024."},
            {"page":2,"text":"Second page: Jane Doe completed treatment."}]}
        out=worker.analyze(data,fake_infer)
        self.assertEqual(out["schema_version"],1)
        self.assertEqual(out["document_sha256"],DIGEST)
        self.assertTrue(out["analysis_complete"])
        self.assertEqual(out["processed_windows"],2)
        self.assertEqual([f["page"] for f in out["findings"]],[1,2])
        self.assertTrue(all(f["review_status"]=="PendingHumanReview" for f in out["findings"]))
        self.assertTrue(out["proposed_only"])

    def test_long_page_is_windowed_without_truncating(self):
        original="Jane Doe records observation. " * 500
        parts=worker.windows([{"page":1,"text":original}])
        self.assertGreater(len(parts),2)
        self.assertEqual("".join(p["text"] for p in parts),original)

    def test_hallucinated_quote_and_wrong_page_are_discarded(self):
        source={"page":3,"text":"Only correct text","start":0}
        self.assertIsNone(worker.source_supported({
            "page":3,"category":"diagnosis","quote":"Invented text",
            "value":"Invented"},source))
        self.assertIsNone(worker.source_supported({
            "page":2,"category":"diagnosis","quote":"Only correct text",
            "value":"Correct"},source))

    def test_model_may_not_create_arbitrary_field_keys(self):
        self.assertIsNone(worker.source_supported({
            "page":1,"field_key":"billing.credit_card","quote":"Known line",
            "value":"anything"}, {"page":1,"text":"Known line","start":0},allow_field=True))

    def test_unreadable_page_is_explicitly_incomplete(self):
        data={"sha256":DIGEST,"pages":[{"page":1,"text":""},{"page":2,"text":"Jane Doe"}]}
        out=worker.analyze(data,fake_infer)
        self.assertFalse(out["analysis_complete"])
        self.assertEqual(out["unreadable_pages"],[1])

    def test_partial_failure_never_claims_all_processed(self):
        def fail_on_second(prompt,**kwargs):
            if "[PAGE 2]" in prompt:
                raise RuntimeError("Bad local inference")
            return fake_infer(prompt,**kwargs)
        out=worker.analyze({"sha256":DIGEST,"pages":[
            {"page":1,"text":"Jane Doe"},{"page":2,"text":"No data"}]},fail_on_second)
        self.assertFalse(out["analysis_complete"])
        self.assertEqual(out["processed_windows"],1)
        self.assertEqual(out["failed_windows"][0]["page"],2)

    def test_rejects_too_many_pages_and_invalid_hash(self):
        with self.assertRaises(ValueError):
            worker.analyze({"sha256":"bad","pages":[{"page":1,"text":"Hi"}]},fake_infer)
        with self.assertRaises(ValueError):
            worker.analyze({"sha256":DIGEST,"pages":[{"page":1,"text":"Hi"}]*26},fake_infer)

if __name__=="__main__":
    unittest.main()
