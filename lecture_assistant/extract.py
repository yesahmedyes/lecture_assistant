from __future__ import annotations

import re
from typing import Dict, List, Optional

import httpx
from lxml import html


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
)


def fetch_url(url: str, timeout_s: float = 10.0) -> Optional[str]:
    try:
        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
        }
        with httpx.Client(
            timeout=timeout_s, follow_redirects=True, headers=headers
        ) as client:
            resp = client.get(url)
            if resp.status_code >= 200 and resp.status_code < 300:
                return resp.text
    except Exception:
        return None
    return None


def html_to_text(html_content: str, max_chars: int = 8000) -> str:
    try:
        doc = html.fromstring(html_content)
        # Drop scripts/styles
        html.etree.strip_elements(doc, "script", "style", with_tail=False)
        text = doc.text_content()
        # Collapse whitespace
        text = re.sub(r"\s+", " ", text).strip()
        return text[:max_chars]
    except Exception:
        return ""


def extract_sources_with_content(
    sources: List[Dict[str, str]], per_source_timeout: float = 8.0
) -> List[Dict[str, str]]:
    enriched: List[Dict[str, str]] = []
    for s in sources:
        url = s.get("url") or s.get("link") or ""
        content = ""
        if url:
            html_raw = fetch_url(url, timeout_s=per_source_timeout)
            if html_raw:
                content = html_to_text(html_raw)
        enriched.append({**s, "content": content})
    return enriched


def score_source_by_authority(url: str, title: str = "", content: str = "") -> float:
    """
    Heuristic author prioritization without LLM:
    - Prefer .edu, .gov, .ac. TLDs
    - Prefer well-known publishers keywords
    - Slight bonus if 'author' or 'by ' present in content/title
    """
    score = 0.0
    t = url.lower()
    if any(
        t.endswith(x) or f".{x}/" in t
        for x in (".edu", ".gov", ".ac.uk", ".ac.in", ".ac.jp")
    ):
        score += 3.0
    if any(
        k in t
        for k in (
            "nature.com",
            "acm.org",
            "ieee.org",
            "arxiv.org",
            "springer",
            "sciencedirect",
        )
    ):
        score += 2.5
    if any(k in t for k in ("medium.com", "substack.com", "wikipedia.org")):
        score += 0.5
    if "arxiv.org" in t:
        score += 1.0
    lt = (title or "").lower()
    lc = (content or "").lower()
    if "author" in lc or "by " in lc or "professor" in lc:
        score += 0.5
    # Penalize obvious low-quality domains
    if any(k in t for k in ("reddit.com", "quora.com", "stackexchange.com")):
        score -= 0.5
    return score


def prioritize_sources(
    sources: List[Dict[str, str]], top_k: int = 12
) -> List[Dict[str, str]]:
    scored = []
    for s in sources:
        url = s.get("url") or ""
        title = s.get("title") or ""
        content = s.get("content") or ""
        score = score_source_by_authority(url, title, content)
        scored.append((score, s))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [s for _, s in scored[:top_k]]
