#!/usr/bin/env python3
"""Local Laya classifier: one JSON request via stdin, one JSON response via stdout.

First model download needs internet; after provisioning, use offline environment
flags below. Never send real client data until product security review.
"""
import json
import os
import sys

def main():
    request = json.load(sys.stdin)
    body = str(request.get("text", ""))[:15000]
    if not body.strip():
        raise ValueError("No document text")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    from laya import Router
    router = Router(preload=False)
    questions = {
        "document_type": {
            "type": "choice",
            "instructions": "Select the category most consistent with the document text.",
            "criteria": {
                "clinical_note": "Healthcare professional clinical note",
                "hospital_summary": "Hospital discharge or encounter summary",
                "work_history": "Occupational, attendance or employment evidence",
                "other": "Other document or insufficient information",
            },
        },
        "functional_evidence": {
            "type": "noul",
            "instructions": "Does the text explicitly describe limitations affecting everyday or work-related functioning?",
        },
    }
    result = router.predict({"body": body}, questions)
    print(json.dumps({"model": str(result.get("routing", {}).get("model", "laya")),
                      "answers": result.get("answers", {}),
                      "raw": result}, default=str))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": f"Laya unavailable: {type(exc).__name__}: {exc}"}))
        sys.exit(1)
