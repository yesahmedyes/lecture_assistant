from __future__ import annotations

import os
from typing import Optional

from langchain_core.language_models.chat_models import BaseChatModel


def get_llm(
    model: Optional[str] = None,
    temperature: float = 0.2,
    seed: Optional[int] = 42,
) -> BaseChatModel:
    """
    Create and return an OpenAI chat LLM instance.

    Requires OPENAI_API_KEY.
    """
    from langchain_openai import ChatOpenAI

    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Please export it to use OpenAI models."
        )
    openai_model = model or "gpt-4o-mini"
    # Deterministic seed when supported by provider
    return ChatOpenAI(model=openai_model, temperature=temperature, seed=seed)
