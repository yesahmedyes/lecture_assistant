from __future__ import annotations

import json
import os
import time
from typing import Any, Dict


def ensure_dir(path: str) -> None:
    if not os.path.isdir(path):
        os.makedirs(path, exist_ok=True)


def log_event(node: str, payload: Dict[str, Any]) -> None:
    ensure_dir("logs")
    entry = {
        "ts": time.time(),
        "node": node,
        **payload,
    }
    path = os.path.join("logs", f"{node}.jsonl")
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def get_model_metadata(llm: Any) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}
    for attr in ("model_name", "model", "temperature", "seed"):
        if hasattr(llm, attr):
            meta[attr] = getattr(llm, attr)
    # LangChain ChatOpenAI stores model in model_name, ChatOllama in model
    return meta


def load_prompt(name: str) -> str:
    here = os.path.dirname(__file__)
    path = os.path.join(here, "prompts", name)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()
