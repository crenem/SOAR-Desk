#!/usr/bin/env python3
"""Offline Laya classification with long-context and windowed fallbacks.

Synthetic documents only. Returns unverified proposals; decisions remain human-only.
"""
import json
import os
import sys

# No inference-time network access. Checkpoints must be provisioned separately.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

MAX_INPUT_CHARS = 200_000
LONG_INPUT_CHARS = 1500
MAX_LEN = 8192


def classify(router, body, key, question):
    state = {"body": body}
    long_context = len(body) > LONG_INPUT_CHARS
    model = "multilingual" if long_context else "english"
    args = {key: question}
    result = router.predict(state, args, model=model, **({"max_len": MAX_LEN} if long_context else {}))
    usage = result.get("usage") or {}
    if usage.get("truncated") or usage.get("state_tokens_dropped", 0):
        # Avoid treating a silently truncated result as evidence.
        result = router.predict_long(state, args, model="multilingual", window=512, stride=384)
        usage = result.get("usage") or {}
        if usage.get("truncated") or usage.get("state_tokens_dropped", 0):
            raise RuntimeError(f"Laya returned truncated output for {key}, even with windowed inference")
        mode = "windowed"
    else:
        mode = "long_context" if long_context else "english"
    return {
        "answer": (result.get("answers") or {}).get(key),
        "mode": mode,
        "model": (result.get("routing") or {}).get("model", model),
        "usage": usage,
    }


def main():
    request = json.load(sys.stdin)
    body = str(request.get("text") or "")
    if not body.strip():
        raise ValueError("No document text")
    if len(body) > MAX_INPUT_CHARS:
        raise ValueError("Document passage exceeds 200,000-character processing limit")

    from laya import Router
    router = Router(preload=False, device="cpu")
    questions = {
        "document_type": {
            "type": "choice",
            "instructions": "Identify the primary document type from its explicitly stated content.",
            "criteria": {
                "clinical_note": "Clinical visit or progress note",
                "hospital_summary": "Hospital encounter or discharge summary",
                "work_history": "Employment or attendance history",
                "other": "Other or cannot determine from the text",
            },
        },
        "functional_evidence": {
            "type": "noul",
            "instructions": "Does this source explicitly describe a person's functional limitations?",
        },
    }
    findings = {key: classify(router, body, key, question) for key, question in questions.items()}
    print(json.dumps({
        "model": "laya",
        "human_review_required": True,
        "document_type": findings["document_type"],
        "functional_evidence": findings["functional_evidence"],
        "truncated": False,
    }, default=str))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": f"Laya classification unavailable: {type(exc).__name__}: {exc}"}))
        sys.exit(1)
