#!/usr/bin/env python3
"""Synthetic localhost-only GenieX inference readiness check for WSL2."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "workers"))
from qwen_worker import GENIEX_BASE, geniex_model, local_json


def main():
    model = geniex_model()
    payload = {
        "model": model, "stream": False, "temperature": 0, "max_tokens": 24,
        "messages": [{"role": "user", "content": "This is a synthetic test. Reply only with the word ready."}],
    }
    result = local_json(GENIEX_BASE + "/chat/completions", payload, timeout=100)
    message = result["choices"][0]["message"]
    if not str(message.get("content", "")).strip():
        raise RuntimeError("GenieX returned no generated text")
    print("GenieX GGUF Q4_0 inference is reachable from WSL2: " + model)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("GenieX NPU inference is not available from WSL2: " + str(exc), file=sys.stderr)
        sys.exit(1)
