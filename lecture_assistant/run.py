from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict

from dotenv import load_dotenv

from .llm_factory import get_llm
from .graph import build_graph, LectureState


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Lecture-Assistant Agent (LangGraph + HITL)"
    )
    parser.add_argument(
        "--topic", type=str, required=True, help="Lecture topic to research and brief"
    )
    parser.add_argument(
        "--model", type=str, default=None, help="LLM model name (provider-specific)"
    )
    parser.add_argument(
        "--temperature", type=float, default=0.2, help="LLM temperature"
    )
    parser.add_argument(
        "--seed", type=int, default=42, help="Deterministic seed for generation"
    )
    parser.add_argument(
        "--non_interactive",
        action="store_true",
        help="Skip interactive review (auto-approve)",
    )
    parser.add_argument(
        "--save_json",
        type=str,
        default=None,
        help="Optional path to save final JSON state",
    )
    return parser.parse_args()


def main() -> None:
    load_dotenv(override=False)
    args = parse_args()

    llm = get_llm(model=args.model, temperature=args.temperature, seed=args.seed)
    app = build_graph(llm)

    initial_state: LectureState = {"topic": args.topic, "seed": int(args.seed)}

    # If non-interactive, preset approval so review node skips input.
    if args.non_interactive:
        initial_state["human_feedback"] = "approve"

    final_state: Dict[str, Any] = app.invoke(
        initial_state,
        config={
            "recursion_limit": 50,
            "configurable": {"thread_id": f"lecture:{args.topic}"},
        },
    )

    print("Final state:", final_state)

    print("\n=== FINAL OUTLINE ===\n")
    print(final_state.get("outline", ""))
    print("\n=== FINAL BRIEF ===\n")
    print(final_state.get("formatted_brief") or final_state.get("brief", ""))

    if args.save_json:
        with open(args.save_json, "w", encoding="utf-8") as f:
            json.dump(final_state, f, ensure_ascii=False, indent=2)
        print(f"\nSaved state to: {args.save_json}")


if __name__ == "__main__":
    main()
