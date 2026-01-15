#!/usr/bin/env python3
"""
Extract training data from memories for intent classifier training.

Each memory has:
- trigger_phrases: example queries that should activate this memory
- semantic_tags: topic tags
- context_type: debug, technical, decision, architecture, etc.
- domain: specific domain
- temporal_class: eternal, long_term, medium_term, short_term

We'll create training data in format:
{
    "text": "trigger phrase or semantic tag combination",
    "label": "context_type"  # or domain, temporal_class, etc.
}
"""

import os
import json
import yaml
from pathlib import Path
from collections import Counter

MEMORY_BASE = Path.home() / ".local/share/memory"


def parse_memory_file(file_path: Path) -> dict | None:
    """Parse a memory markdown file with YAML frontmatter."""
    try:
        content = file_path.read_text()
        if not content.startswith("---"):
            return None

        # Split frontmatter from content
        parts = content.split("---", 2)
        if len(parts) < 3:
            return None

        frontmatter = yaml.safe_load(parts[1])
        body = parts[2].strip()

        return {
            "frontmatter": frontmatter,
            "body": body,
            "file": str(file_path)
        }
    except Exception as e:
        print(f"Error parsing {file_path}: {e}")
        return None


def extract_all_memories():
    """Extract all memories from all projects."""
    memories = []

    for project_dir in MEMORY_BASE.iterdir():
        if not project_dir.is_dir():
            continue

        memories_dir = project_dir / "memories"
        if not memories_dir.exists():
            continue

        for memory_file in memories_dir.glob("*.md"):
            memory = parse_memory_file(memory_file)
            if memory:
                memories.append(memory)

    return memories


def create_training_data(memories: list) -> dict:
    """
    Create training datasets for different classifiers.

    Returns:
    {
        "context_type": [{"text": "...", "label": "..."}, ...],
        "domain": [...],
        "temporal_class": [...],
    }
    """
    datasets = {
        "context_type": [],
        "domain": [],
        "temporal_class": [],
    }

    stats = {
        "total_memories": len(memories),
        "context_type_counts": Counter(),
        "domain_counts": Counter(),
        "temporal_class_counts": Counter(),
        "trigger_phrases_count": 0,
        "semantic_tags_count": 0,
    }

    for memory in memories:
        fm = memory["frontmatter"]

        # Extract fields
        trigger_phrases = fm.get("trigger_phrases", [])
        semantic_tags = fm.get("semantic_tags", [])
        context_type = fm.get("context_type", "")
        domain = fm.get("domain", "")
        temporal_class = fm.get("temporal_class", "")
        body = memory["body"]

        # Skip if no trigger phrases
        if not trigger_phrases and not semantic_tags:
            continue

        stats["trigger_phrases_count"] += len(trigger_phrases)
        stats["semantic_tags_count"] += len(semantic_tags)

        # Create training examples from trigger phrases
        for phrase in trigger_phrases:
            if phrase and context_type:
                datasets["context_type"].append({
                    "text": phrase,
                    "label": context_type
                })
                stats["context_type_counts"][context_type] += 1

            if phrase and domain:
                datasets["domain"].append({
                    "text": phrase,
                    "label": domain
                })
                stats["domain_counts"][domain] += 1

            if phrase and temporal_class:
                datasets["temporal_class"].append({
                    "text": phrase,
                    "label": temporal_class
                })
                stats["temporal_class_counts"][temporal_class] += 1

        # Also create examples from semantic tags (as if user typed them)
        for tag in semantic_tags:
            if tag and context_type:
                datasets["context_type"].append({
                    "text": tag.replace("-", " "),  # "memory-system" -> "memory system"
                    "label": context_type
                })

    return datasets, stats


def main():
    print("=" * 60)
    print("Memory Training Data Extractor")
    print("=" * 60)
    print()

    print("Scanning memory directories...")
    memories = extract_all_memories()
    print(f"Found {len(memories)} memories")
    print()

    print("Extracting training data...")
    datasets, stats = create_training_data(memories)

    # Print statistics
    print()
    print("=" * 60)
    print("STATISTICS")
    print("=" * 60)
    print(f"Total memories: {stats['total_memories']}")
    print(f"Total trigger phrases: {stats['trigger_phrases_count']}")
    print(f"Total semantic tags: {stats['semantic_tags_count']}")
    print()

    print("Context Type Distribution:")
    for ct, count in stats["context_type_counts"].most_common():
        print(f"  {ct}: {count}")
    print()

    print("Domain Distribution (top 15):")
    for domain, count in stats["domain_counts"].most_common(15):
        print(f"  {domain}: {count}")
    print()

    print("Temporal Class Distribution:")
    for tc, count in stats["temporal_class_counts"].most_common():
        print(f"  {tc}: {count}")
    print()

    # Print dataset sizes
    print("=" * 60)
    print("DATASET SIZES")
    print("=" * 60)
    for name, data in datasets.items():
        print(f"  {name}: {len(data)} examples")
    print()

    # Save datasets
    output_dir = Path(__file__).parent / "training_data"
    output_dir.mkdir(exist_ok=True)

    for name, data in datasets.items():
        output_file = output_dir / f"{name}_train.json"
        with open(output_file, "w") as f:
            json.dump(data, f, indent=2)
        print(f"Saved: {output_file}")

    # Also save as JSONL (common format for training)
    for name, data in datasets.items():
        output_file = output_dir / f"{name}_train.jsonl"
        with open(output_file, "w") as f:
            for item in data:
                f.write(json.dumps(item) + "\n")
        print(f"Saved: {output_file}")

    # Print sample data
    print()
    print("=" * 60)
    print("SAMPLE DATA (context_type)")
    print("=" * 60)
    for item in datasets["context_type"][:10]:
        print(f"  \"{item['text']}\" -> {item['label']}")


if __name__ == "__main__":
    main()
