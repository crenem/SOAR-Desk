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
        self.assertNotIn("enable_think", calls[0][1])
        self.assertEqual([m["role"] for m in calls[0][1]["messages"]], ["user"])

    def test_geniex_omits_explicit_thinking_parameter(self):
        """Confirmed on Windows: enable_think=false returned zero tokens."""
        usable = {"choices":[{"finish_reason":"stop",
                               "message":{"content":'{"summary":"Hello","findings":[]}'}}],
                  "usage":{"completion_tokens":10}}
        with patch.object(worker, "local_json", return_value=usable) as call:
            worker.geniex_completion("unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_0",
                [{"role":"user","content":"Fictional hello"}], attempts=1, require_json=True)
        payload = call.call_args.args[1]
        self.assertNotIn("enable_think", payload)
        self.assertEqual(len(payload["messages"]), 1)
        self.assertEqual(payload["messages"][0]["role"], "user")

    def test_geniex_extract_request_uses_verified_http_shape(self):
        result={"choices":[{"finish_reason":"stop",
                             "message":{"content":'{"summary":"fictional","findings":[]}'}}]}
        with patch.dict(os.environ, {"SOAR_QWEN_BACKEND":"npu"}):
            with patch.object(worker,"geniex_model",
                              return_value="unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_0"):
                with patch.object(worker,"local_json",return_value=result) as call:
                    worker.request_model("Fictional record: Jane reports knee pain.")
        payload=call.call_args.args[1]
        self.assertNotIn("enable_think",payload)
        self.assertEqual([m["role"] for m in payload["messages"]],["user"])
        self.assertIn("EXACT contiguous substring", payload["messages"][0]["content"])
        self.assertIn("Fictional record: Jane reports knee pain.",payload["messages"][0]["content"])

    def test_retry_a_transient_zero_token_geniex_completion(self):
        blank = {"choices":[{"finish_reason":"stop","message":{"content":""}}],
                 "usage":{"completion_tokens":0}}
        valid = {"choices":[{"finish_reason":"stop",
                              "message":{"content":'{"summary":"Fictional note.","findings":[]}'}}],
                 "usage":{"completion_tokens":12}}
        with patch.object(worker,"local_json",side_effect=[blank,valid]) as request:
            result=worker.geniex_completion("synthetic-qwen",
                [{"role":"user","content":"Synthetic testing only."}],
                max_tokens=256,require_json=True)
        self.assertEqual(worker.parse_content(worker.response_text(result))["summary"],"Fictional note.")
        self.assertEqual(request.call_count,2)
        self.assertTrue(all(call.args[0].startswith(worker.GENIEX_BASE)
                            for call in request.call_args_list))

    def test_persistent_zero_token_stop_is_not_marked_healthy(self):
        blank={"choices":[{"finish_reason":"stop","message":{"content":""}}],
               "usage":{"completion_tokens":0}}
        with patch.object(worker,"local_json",return_value=blank) as request:
            with self.assertRaisesRegex(ValueError,"completion_tokens=0"):
                worker.geniex_completion("synthetic-qwen",
                    [{"role":"user","content":"Fictional test."}],attempts=2)
        self.assertEqual(request.call_count,2)

    def test_geniex_retries_malformed_json_then_returns_valid_json(self):
        invalid={"choices":[{"finish_reason":"stop","message":{"content":"Not JSON"}}]}
        good={"choices":[{"finish_reason":"stop","message":{"content":'{"summary":"OK","findings":[]}'}}]}
        with patch.object(worker,"local_json",side_effect=[invalid,good]):
            result=worker.geniex_completion("synthetic-qwen",
                [{"role":"user","content":"Fictional test."}],require_json=True)
        self.assertEqual(worker.parse_content(worker.response_text(result))["summary"],"OK")

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
