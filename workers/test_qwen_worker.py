"""No-network tests of local inference routing and evidence parser."""
import io
import json
import os
import unittest
from unittest.mock import patch

import qwen_worker as worker


class AdapterTests(unittest.TestCase):
    def test_forbids_remote_hosts(self):
        with self.assertRaises(ValueError):
            worker.local_json("https://example.org/v1/chat/completions")

    def test_selects_specific_gguf_model(self):
        with patch.object(worker, "local_json", return_value={
            "data": [{"id": "ai-hub-models/Qwen3-4B-Instruct-2507"},
                     {"id": "unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_0"}]
        }):
            self.assertEqual(worker.geniex_model(), "unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_0")

    def test_rejects_qairt_only_model(self):
        with patch.object(worker, "local_json", return_value={
            "data": [{"id": "ai-hub-models/Qwen3-4B-Instruct-2507"}]
        }):
            with self.assertRaises(ValueError):
                worker.geniex_model()

    def test_npu_preferred(self):
        fake = {"choices": [{"message": {"content": '{"summary":"test","findings":[]}'}}]}
        with patch.dict(os.environ, {"SOAR_QWEN_BACKEND": "auto"}):
            with patch.object(worker, "geniex_model", return_value=worker.NPU_MODEL_PREFIX):
                with patch.object(worker, "local_json", return_value=fake) as call:
                    result, backend, model = worker.request_model("synthetic")
        self.assertEqual(backend, "npu")
        self.assertEqual(model, worker.NPU_MODEL_PREFIX)
        self.assertIn("18181", call.call_args.args[0])

    def test_cpu_fallback(self):
        fake = {"choices": [{"message": {"content": '{"summary":"test","findings":[]}'}}]}
        with patch.dict(os.environ, {"SOAR_QWEN_BACKEND": "auto"}):
            with patch.object(worker, "geniex_model", side_effect=ValueError("no model")):
                with patch.object(worker, "local_json", return_value=fake):
                    _, backend, _ = worker.request_model("synthetic")
        self.assertEqual(backend, "cpu")

    def test_empty_geniex_output_falls_back_to_cpu(self):
        from urllib.parse import urlparse
        fake = {"choices": [{"message": {"content": '{"summary":"test","findings":[]}'}}]}
        calls = []
        def respond(url, body=None, timeout=None):
            calls.append((url, body))
            if urlparse(url).port == 18181:
                return {"choices": [{"finish_reason": "length", "message": {"content": ""}}]}
            return fake
        with patch.dict(os.environ, {"SOAR_QWEN_BACKEND": "auto"}):
            with patch.object(worker, "geniex_model", return_value=worker.NPU_MODEL_PREFIX):
                with patch.object(worker, "local_json", side_effect=respond):
                    _, backend, _ = worker.request_model("synthetic")
        self.assertEqual(backend, "cpu")
        self.assertIs(calls[0][1]["enable_think"], False)

    def test_invalid_npu_json_does_not_claim_success(self):
        fake = {"choices": [{"message": {"content": "This is not JSON"}}]}
        with patch.dict(os.environ, {"SOAR_QWEN_BACKEND": "npu"}):
            with patch.object(worker, "geniex_model", return_value=worker.NPU_MODEL_PREFIX):
                with patch.object(worker, "local_json", return_value=fake):
                    with self.assertRaises(RuntimeError):
                        worker.request_model("synthetic")

    def test_invalid_model_json_rejected(self):
        with self.assertRaises(ValueError):
            worker.parse_content('{"findings":"not a list"}')

    def test_fenced_json_parsed(self):
        actual = worker.parse_content('```json\n{"summary":"ok","findings":[]}\n```')
        self.assertEqual(actual["summary"], "ok")


if __name__ == "__main__":
    unittest.main()
