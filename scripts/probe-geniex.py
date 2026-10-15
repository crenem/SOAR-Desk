#!/usr/bin/env python3
"""Synthetic, localhost-only GenieX model-output readiness check for WSL2.

Unlike a /v1/models listing, this must observe actual generated assistant content.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "workers"))
from qwen_worker import GENIEX_BASE, geniex_model, local_json


def verify_response(response):
    choices = response.get("choices") or []
    if not choices:
        raise RuntimeError("GenieX returned no choices")
    first = choices[0]
    message = first.get("message") or {}
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return
    finish = first.get("finish_reason", "unknown")
    usage = response.get("usage") or {}
    tokens = usage.get("completion_tokens", "unknown")
    reasoning = bool(message.get("reasoning_content"))
    raise RuntimeError(
        "GenieX returned no generated text "
        f"(finish_reason={finish}, completion_tokens={tokens}, "
        f"reasoning_only={reasoning}). The model may need a larger output "
        "budget or different server configuration."
    )


def main():
    model = geniex_model()
    payload = {
        "model": model,
        "stream": False,
        "temperature": 0.2,
        "max_tokens": 192,
        "enable_think": False,
        "messages": [
            {"role": "user", "content":
             "Fictional test record: Jane Doe reports knee pain. "
             "Reply with a single brief factual sentence summarizing it."}
        ],
    }
    result = local_json(GENIEX_BASE + "/chat/completions", payload, timeout=120)
    verify_response(result)
    print("GenieX GGUF Q4_0 generated text from WSL2: " + model)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("GenieX text inference was not confirmed from WSL2: " + str(exc), file=sys.stderr)
        sys.exit(1)
