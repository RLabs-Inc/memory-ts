#!/usr/bin/env python3
"""
MiniLM Intent Classifier Latency Test

Tests a pre-trained intent classifier for message classification.
This is a CLASSIFIER (single forward pass) not a GENERATIVE model.
Should be much faster than LLM-based approaches.
"""

import time
import numpy as np

# Test messages (same as other tests)
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


def test_transformers_classifier():
    """Test using Hugging Face Transformers pipeline."""
    from transformers import pipeline

    print("=" * 60)
    print("Testing: MiniLM Intent Classifier (Transformers)")
    print("=" * 60)

    print("Loading model...")
    load_start = time.time()
    classifier = pipeline(
        "text-classification",
        model="kousik-2310/intent-classifier-minilm",
        device="mps"  # Use Metal on Mac
    )
    load_time = time.time() - load_start
    print(f"Model loaded in {load_time:.1f}s")
    print()

    results = []
    total_time = 0

    for msg in TEST_MESSAGES:
        start = time.time()
        result = classifier(msg)
        elapsed = (time.time() - start) * 1000
        total_time += elapsed

        results.append({
            "message": msg,
            "result": result,
            "time_ms": elapsed
        })

        print(f'Message: "{msg}"')
        print(f"  Time: {elapsed:.1f}ms")
        print(f"  Result: {result}")
        print()

    avg_time = total_time / len(TEST_MESSAGES)
    print("-" * 60)
    print("SUMMARY")
    print("-" * 60)
    print(f"Total messages: {len(TEST_MESSAGES)}")
    print(f"Total time: {total_time:.1f}ms")
    print(f"Average latency: {avg_time:.1f}ms")
    print()

    if avg_time < 20:
        print("EXCELLENT: <20ms average - perfect for every-message use!")
    elif avg_time < 50:
        print("VERY GOOD: <50ms average - great for every-message use!")
    elif avg_time < 100:
        print("GOOD: <100ms average - acceptable for every-message use")
    else:
        print(f"SLOW: {avg_time:.0f}ms average")

    return avg_time


def test_onnx_classifier():
    """Test using ONNX Runtime for maximum speed."""
    try:
        import onnxruntime as ort
        from transformers import AutoTokenizer
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("ONNX Runtime not installed. Run: pip install onnxruntime")
        return None

    print()
    print("=" * 60)
    print("Testing: MiniLM Intent Classifier (ONNX int8)")
    print("=" * 60)

    print("Loading model...")
    load_start = time.time()

    # Download the ONNX model
    model_path = hf_hub_download(
        repo_id="kousik-2310/intent-classifier-minilm",
        filename="onnx/model_int8.onnx"
    )

    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained("kousik-2310/intent-classifier-minilm")

    # Load ONNX model with CoreML execution provider for Mac
    providers = ['CoreMLExecutionProvider', 'CPUExecutionProvider']
    session = ort.InferenceSession(model_path, providers=providers)

    load_time = time.time() - load_start
    print(f"Model loaded in {load_time:.1f}s")
    print(f"Providers: {session.get_providers()}")
    print()

    results = []
    total_time = 0

    for msg in TEST_MESSAGES:
        # Tokenize
        inputs = tokenizer(msg, return_tensors="np", padding=True, truncation=True)

        # Build input dict based on what the model expects
        input_feed = {
            "input_ids": inputs["input_ids"].astype(np.int64),
            "attention_mask": inputs["attention_mask"].astype(np.int64)
        }
        # Add token_type_ids if required
        if "token_type_ids" in [inp.name for inp in session.get_inputs()]:
            input_feed["token_type_ids"] = np.zeros_like(inputs["input_ids"], dtype=np.int64)

        start = time.time()
        outputs = session.run(None, input_feed)
        elapsed = (time.time() - start) * 1000
        total_time += elapsed

        # Get prediction
        logits = outputs[0]
        predicted_class = np.argmax(logits, axis=1)[0]

        results.append({
            "message": msg,
            "class": predicted_class,
            "logits": logits[0][:5].tolist(),  # First 5 logits
            "time_ms": elapsed
        })

        print(f'Message: "{msg}"')
        print(f"  Time: {elapsed:.1f}ms")
        print(f"  Predicted class: {predicted_class}")
        print()

    avg_time = total_time / len(TEST_MESSAGES)
    print("-" * 60)
    print("SUMMARY (ONNX)")
    print("-" * 60)
    print(f"Total messages: {len(TEST_MESSAGES)}")
    print(f"Total time: {total_time:.1f}ms")
    print(f"Average latency: {avg_time:.1f}ms")
    print()

    if avg_time < 10:
        print("BLAZING: <10ms average - absolutely perfect!")
    elif avg_time < 20:
        print("EXCELLENT: <20ms average - perfect for every-message use!")
    elif avg_time < 50:
        print("VERY GOOD: <50ms average - great for every-message use!")
    elif avg_time < 100:
        print("GOOD: <100ms average - acceptable for every-message use")
    else:
        print(f"SLOW: {avg_time:.0f}ms average")

    return avg_time


def main():
    print("MiniLM Intent Classifier Latency Test")
    print("=" * 60)
    print()
    print("This tests a PRE-TRAINED CLASSIFIER (single forward pass)")
    print("vs generative models (token-by-token generation).")
    print()

    # Test Transformers version (uses PyTorch/Metal)
    try:
        tf_time = test_transformers_classifier()
    except Exception as e:
        print(f"Transformers test failed: {e}")
        tf_time = None

    # Test ONNX version (should be faster)
    try:
        onnx_time = test_onnx_classifier()
    except Exception as e:
        print(f"ONNX test failed: {e}")
        onnx_time = None

    # Summary
    print()
    print("=" * 60)
    print("FINAL COMPARISON")
    print("=" * 60)
    if tf_time:
        print(f"  Transformers (Metal): {tf_time:.1f}ms avg")
    if onnx_time:
        print(f"  ONNX (int8): {onnx_time:.1f}ms avg")
    print()
    print("Compare to:")
    print("  Foundation Models: ~2600ms avg")
    print("  MLX Qwen 0.5B: ~640ms avg")
    print("  MLX SmolLM 135M: ~440ms avg")


if __name__ == "__main__":
    main()
