#!/usr/bin/env python3
"""Synthetic localhost-only GenieX readiness probe (not just /v1/models).

Checks that the same GGUF model can produce parseable source-grounded JSON,
with one retry for a transient empty model response. Does not imply the
hardware actually used the NPU; only GenieX could verify acceleration.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "workers"))
from qwen_worker import geniex_completion, geniex_model, parse_content


def main():
    model = geniex_model()
    messages = [
        {"role": "system", "content": "Return a short JSON object. No markdown or reasoning."},
        {"role": "user", "content":
         'Synthetic note: "Jane Doe reports knee pain." '
         'Reply with JSON only: {"summary":"Jane Doe reports knee pain.",'
         '"findings":[]}'}
    ]
    response = geniex_completion(
        model, messages, max_tokens=256, temperature=0.2, require_json=True
    )
    parsed = parse_content(response["choices"][0]["message"]["content"])
    if not isinstance(parsed.get("summary"), str) or not parsed["summary"].strip():
        raise ValueError("GenieX did not provide a populated JSON summary")
    print("GenieX local GGUF generated valid JSON from WSL2: " + model)
    print("GenieX readiness verified; hardware acceleration type not inferred.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(
            "GenieX is present or configured but usable text inference was not verified: "
            + str(exc),
            file=sys.stderr,
        )
        sys.exit(1)
