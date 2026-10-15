#!/usr/bin/env python3
"""Offline-only Qwen3-4B clinical candidate extraction against local llama.cpp.

No remote endpoint, network model download, or real client documents allowed.
"""
import json
import sys
import urllib.error
import urllib.request

ENDPOINT = "http://127.0.0.1:8080/v1/chat/completions"
CATEGORIES = ["diagnosis", "medical_history", "psychiatric_history", "medication",
              "allergy", "functional_limitation", "treatment", "encounter", "other"]
SYSTEM = """You extract evidence candidates from SYNTHETIC hospital records.
Never invent facts. Output JSON only: {"summary":"brief literal summary","findings":[{"category":"diagnosis","value":"source-supported factual statement","quote":"EXACT contiguous substring from supplied passage"}]}.
Allowed categories: diagnosis, medical_history, psychiatric_history, medication, allergy, functional_limitation, treatment, encounter, other.
Use an exact verbatim quote from the original text for EACH finding. If source lacks support omit it.
Do not infer severity, disability eligibility, ICD codes, or causal relationships. Differentiate reported vs observed in value wording. At most 8 findings per passage. Summary is only a proposed unverified description."""


def request_model(text):
    payload = {
        "model": "qwen3-4b",
        "stream": False,
        "temperature": 0.1,
        "max_tokens": 650,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": "Extract source-grounded candidate findings from this SYNTHETIC passage:\n" + text + "\n/no_think"},
        ],
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode("utf-8"),
                                 method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=150) as response:
        if response.url != ENDPOINT:
            raise ValueError("Local inference redirect rejected")
        return json.load(response)


def main():
    data = json.load(sys.stdin)
    text = str(data.get("text", "")).strip()
    if not text or len(text) > 5000:
        raise ValueError("Expected nonempty synthetic passage under 5,000 characters")
    result = request_model(text)
    message = result["choices"][0]["message"]
    content = message.get("content", "")
    parsed = json.loads(content)
    findings = []
    for item in parsed.get("findings", []):
        if not isinstance(item, dict):
            continue
        quote = str(item.get("quote", "")).strip()
        value = str(item.get("value", "")).strip()
        category = str(item.get("category", "other"))
        # Fail closed if the proposed evidence does not quote the actual input.
        if quote and quote in text and value and category in CATEGORIES:
            findings.append({"category": category, "value": value[:550], "quote": quote[:700],
                             "review_status": "PendingHumanReview"})
    print(json.dumps({"model": "Qwen3-4B-GGUF", "summary": str(parsed.get("summary", ""))[:750],
                      "findings": findings[:8], "proposed_only": True}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (urllib.error.URLError, TimeoutError) as exc:
        print(json.dumps({"error": "Qwen local llama.cpp server is not available on 127.0.0.1:8080: " + str(exc)}))
        sys.exit(1)
    except Exception as exc:
        print(json.dumps({"error": "Qwen extraction failed: " + type(exc).__name__ + ": " + str(exc)}))
        sys.exit(1)
