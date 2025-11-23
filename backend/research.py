from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Dict

try:
    from tavily import TavilyClient
except ImportError as e:
    raise ImportError(
        "Missing dependency 'tavily-python'. Install it with: pip install tavily-python"
    ) from e


@dataclass
class SearchResult:
    title: str
    link: str
    snippet: str


def web_search(query: str, max_results: int = 8) -> List[SearchResult]:
    """
    Run a web search using Tavily API and return a list of SearchResult.
    """
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        raise ValueError(
            "TAVILY_API_KEY not found in environment variables. "
            "Please set it in your .env file or environment."
        )

    results: List[SearchResult] = []
    client = TavilyClient(api_key=api_key)

    try:
        response = client.search(query=query, max_results=max_results)
        for r in response.get("results", []):
            title = r.get("title") or ""
            url = r.get("url") or ""
            content = r.get("content") or ""
            if url:
                results.append(SearchResult(title=title, link=url, snippet=content))
    except Exception as e:
        print(f"Warning: Tavily search failed for query '{query}': {e}")

    return results


def research_topic(
    topic: str,
    extra_queries: List[str] | None = None,
    per_query: int = 6,
    max_total_results: int = 20,
) -> List[Dict[str, str]]:
    """
    Produce a merged list of sources for a topic by running multiple queries.
    Stops collecting once max_total_results is reached.
    """
    queries: List[str] = [
        f"{topic} overview",
        f"{topic} key concepts",
        f"{topic} latest research",
    ]
    if extra_queries:
        queries.extend(extra_queries)

    collected: List[Dict[str, str]] = []
    seen_links = set()
    for q in queries:
        # Stop if we've reached the maximum
        if len(collected) >= max_total_results:
            break
        for s in web_search(q, max_results=per_query):
            # Stop if we've reached the maximum
            if len(collected) >= max_total_results:
                break
            if s.link in seen_links:
                continue
            seen_links.add(s.link)
            collected.append(
                {"title": s.title, "url": s.link, "snippet": s.snippet, "query": q}
            )
    return collected
