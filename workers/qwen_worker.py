#!/usr/bin/env python3
"""SOAR Desk local-only Qwen candidate extraction: GenieX NPU or llama.cpp CPU.

All inputs must be synthetic. Only 127.0.0.1 endpoints are permitted.
"""
import json
import os
import sys
import urllib.error
import urllib.request

GENIEX_BASE = "http://127.0.0.1:18181/v1"
CPU_BASE = "http://127.0.0.1:8080/v1"
NPU_MODEL_PREFIX = "unsloth/Qwen3-4B-Instruct-2507-GGUF"
CATEGORIES = {"diagnosis", "medical_history", "psychiatric_history", "medication",
              "allergy", "functional_limitation", "treatment", "encounter", "other"}
SYSTEM = """You extract evidence candidates from SYNTHETIC hospital records.
Never invent facts. Output JSON only: {"summary":"brief literal summary","findings":[{"category":"diagnosis","value":"source-supported factual statement","quote":"EXACT contiguous substring from supplied passage"}]}.
Allowed categories: diagnosis, medical_history, psychiatric_history, medication, allergy, functional_limitation, treatment, encounter, other.
Use an exact verbatim quote from the original text for EACH finding. If source lacks support omit it.
Do not infer severity, disability eligibility, ICD codes, or causal relationships. Differentiate reported vs observed in value wording. At most 8 findings per passage. Summary is only a proposed unverified description."""

# No ambient HTTP proxies; no arbitrary user-configurable inference endpoints.
class RefuseRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Inference redirects are prohibited")


OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), RefuseRedirect())


def local_json(url, body=None, timeout=10):
    if not (url.startswith(GENIEX_BASE + "/") or url.startswith(CPU_BASE + "/")):
        raise ValueError("Non-loopback inference endpoint prohibited")
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"} if payload else {},
        method="POST" if payload else "GET",
    )
    with OPENER.open(request, timeout=timeout) as response:
        if response.geturl() != url:
            raise ValueError("Model server redirected an inference request")
        return json.load(response)


def geniex_model():
    models = local_json(GENIEX_BASE + "/models", timeout=3)
    for item in models.get("data", []):
        model_id = item.get("id", "")
        if isinstance(model_id, str) and (
            model_id == NPU_MODEL_PREFIX or model_id.startswith(NPU_MODEL_PREFIX + ":Q4_0")
        ):
            return model_id
    raise ValueError("GenieX is running, but the verified Qwen3 4B GGUF Q4_0 model was not listed")


def request_model(text):
    mode = os.environ.get("SOAR_QWEN_BACKEND", "auto").lower()
    if mode not in ("auto", "npu", "cpu"):
        raise ValueError("SOAR_QWEN_BACKEND must be auto, npu, or cpu")
    errors = []
    for backend in (["npu", "cpu"] if mode == "auto" else [mode]):
        try:
            if backend == "npu":
                base, model = GENIEX_BASE, geniex_model()
            else:
                base, model = CPU_BASE, "qwen3-4b"
            payload = {
                "model": model, "stream": False, "temperature": 0.1,
                "max_tokens": 650,
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": "Extract source-grounded candidate findings from this SYNTHETIC passage:\n" + text + "\n/no_think"},
                ],
            }
            if backend == "cpu":
                payload["response_format"] = {"type": "json_object"}
            return local_json(base + "/chat/completions", payload, timeout=180), backend, model
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as exc:
            errors.append(backend + ": " + str(exc))
    raise RuntimeError("Local Qwen inference unavailable. " + "; ".join(errors))


def parse_content(content):
    if not isinstance(content, str):
        raise ValueError("Model did not return text")
    value = content.strip()
    if value.startswith("```json") or value.startswith("```JSON"):
        value = value[7:]
    elif value.startswith("```"):
        value = value[3:]
    if value.endswith("```"):
        value = value[:-3]
    parsed = json.loads(value.strip())
    if not isinstance(parsed, dict) or not isinstance(parsed.get("findings", []), list):
        raise ValueError("Invalid clinical extraction JSON format")
    return parsed


def main():
    data = json.load(sys.stdin)
    text = str(data.get("text", "")).strip()
    if not text or len(text) > 5000:
        raise ValueError("Expected nonempty synthetic passage under 5,000 characters")
    result, backend, model_id = request_model(text)
    message = result["choices"][0]["message"]
    parsed = parse_content(message.get("content"))
    findings = []
    for item in parsed.get("findings", []):
        if not isinstance(item, dict):
            continue
        quote = str(item.get("quote", "")).strip()
        value = str(item.get("value", "")).strip()
        category = str(item.get("category", "other"))
        # Verbatim support required; model interpretations remain unverified.
        if quote and quote in text and value and category in CATEGORIES:
            findings.append({"category": category, "value": value[:550], "quote": quote[:700],
                             "review_status": "PendingHumanReview"})
    print(json.dumps({"model": model_id, "backend": backend,
                      "summary": str(parsed.get("summary", ""))[:750],
                      "findings": findings[:8], "proposed_only": True}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": "Qwen extraction failed: " + type(exc).__name__ + ": " + str(exc)}))
        sys.exit(1)
