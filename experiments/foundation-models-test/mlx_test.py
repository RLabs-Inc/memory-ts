#!/usr/bin/env python3
"""
MLX Intent Extraction Latency Test

Tests small Hugging Face models via MLX for message intent extraction.
"""

import time
import json
from mlx_lm import load, generate

# Test messages (same as Swift test)
TEST_MESSAGES = [
    "that bug we fixed yesterday with the embeddings",
    "working on the retrieval algorithm again",
    "remember when we discussed the architecture for the memory system?",
    "help me implement the new feature",
    "what was the decision we made about using fsdb?",
    "I'm getting an error in the curator",
    "continue where we left off",
    "how does the activation signal algorithm work?"
]

# System prompt for intent extraction
SYSTEM_PROMPT = """Extract the intent from the user message for a memory retrieval system.
Return ONLY a JSON object with these fields:
- likelyTypes: array of 1-3 types from [debug, technical, decision, architecture, breakthrough, personal, philosophy, workflow, todo, unresolved]
- temporalHint: "recent", "historical", or "any"
- domain: specific technical domain if mentioned, or null
- seekingContinuation: true if user says "again", "continue", "back to", etc.
- keyConcepts: array of 2-5 key concepts

Example output:
{"likelyTypes":["debug","technical"],"temporalHint":"recent","domain":"embeddings","seekingContinuation":true,"keyConcepts":["bug","embeddings"]}"""


def test_model(model_name: str):
    """Test a single model for latency and quality."""
    print(f"\n{'='*60}")
    print(f"Testing: {model_name}")
    print(f"{'='*60}")

    # Load model (this includes download if needed)
    print("Loading model...")
    load_start = time.time()
    model, tokenizer = load(model_name)
    load_time = time.time() - load_start
    print(f"Model loaded in {load_time:.1f}s")
    print()

    results = []
    total_time = 0

    for msg in TEST_MESSAGES:
        # Build the prompt
        prompt = f"{SYSTEM_PROMPT}\n\nUser message: \"{msg}\"\n\nJSON output:"

        # Time the generation
        start = time.time()
        response = generate(
            model,
            tokenizer,
            prompt=prompt,
            max_tokens=150,  # Short response expected
            verbose=False
        )
        elapsed = (time.time() - start) * 1000  # Convert to ms
        total_time += elapsed

        results.append({
            "message": msg,
            "response": response.strip(),
            "time_ms": elapsed
        })

        print(f'Message: "{msg}"')
        print(f"  Time: {elapsed:.1f}ms")
        print(f"  Response: {response.strip()[:100]}...")
        print()

    # Summary
    avg_time = total_time / len(TEST_MESSAGES)
    print("-" * 60)
    print("SUMMARY")
    print("-" * 60)
    print(f"Model: {model_name}")
    print(f"Total messages: {len(TEST_MESSAGES)}")
    print(f"Total time: {total_time:.1f}ms")
    print(f"Average latency: {avg_time:.1f}ms")
    print()

    if avg_time < 50:
        print("EXCELLENT: <50ms average - suitable for every-message use!")
    elif avg_time < 100:
        print("GOOD: <100ms average - acceptable for every-message use")
    elif avg_time < 200:
        print("OK: <200ms average - might be noticeable but usable")
    elif avg_time < 500:
        print("MARGINAL: <500ms average - noticeable delay")
    else:
        print(f"SLOW: >{avg_time:.0f}ms average - may need smaller model")

    return avg_time


def main():
    print("MLX Intent Extraction Latency Test")
    print("=" * 60)
    print()

    # Models to test (smallest to largest)
    # These are MLX-optimized versions from the mlx-community on Hugging Face
    models = [
        # Tiny model - 135M parameters (SmolLM)
        "mlx-community/SmolLM-135M-Instruct-4bit",

        # Small models (~0.5B parameters)
        # "mlx-community/Qwen2.5-0.5B-Instruct-4bit",
    ]

    results = {}
    for model_name in models:
        try:
            avg_time = test_model(model_name)
            results[model_name] = avg_time
        except Exception as e:
            print(f"ERROR testing {model_name}: {e}")
            results[model_name] = None

    # Final comparison
    if len(results) > 1:
        print("\n" + "=" * 60)
        print("COMPARISON")
        print("=" * 60)
        for model, avg in sorted(results.items(), key=lambda x: x[1] or float('inf')):
            if avg:
                print(f"  {model}: {avg:.1f}ms")
            else:
                print(f"  {model}: FAILED")


if __name__ == "__main__":
    main()
