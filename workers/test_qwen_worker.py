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

    def test_invalid_model_json_rejected(self):
        with self.assertRaises(ValueError):
            worker.parse_content('{"findings":"not a list"}')

    def test_fenced_json_parsed(self):
        actual = worker.parse_content('```json\n{"summary":"ok","findings":[]}\n```')
        self.assertEqual(actual["summary"], "ok")


if __name__ == "__main__":
    unittest.main()
