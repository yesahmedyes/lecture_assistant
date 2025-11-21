from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from .llm_factory import get_llm
from .logging_utils import load_prompt, get_model_metadata, log_event
from .research import research_topic
from .extract import extract_sources_with_content, prioritize_sources
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate


app = FastAPI(title="Lecture Assistant API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Lecture Assistant API", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    return {"status": "ok"}


class PlanRequest(BaseModel):
    topic: str
    seed: Optional[int] = 42


class PlanResponse(BaseModel):
    queries: List[str]
    plan_summary: str
    model: Dict[str, Any]


@app.post("/api/plan", response_model=PlanResponse)
def api_plan(req: PlanRequest):
    print(req)

    llm = get_llm(seed=req.seed)
    # Plan queries
    pq_text = load_prompt("plan_queries.txt")
    pq_prompt = ChatPromptTemplate.from_template(pq_text)
    queries_text = (pq_prompt | llm | StrOutputParser()).invoke({"topic": req.topic})
    queries = [q.strip("- ").strip() for q in queries_text.splitlines() if q.strip()][
        :5
    ]
    # Plan brief
    pb_text = load_prompt("plan_brief.txt")
    pb_prompt = ChatPromptTemplate.from_template(pb_text)
    plan = (pb_prompt | llm | StrOutputParser()).invoke(
        {"topic": req.topic, "queries": "\n".join(queries)}
    )
    log_event(
        "api_plan",
        {
            "inputs": {"topic": req.topic},
            "prompt": {"plan_queries": pq_text, "plan_brief": pb_text},
            "outputs": {"queries": queries, "plan_preview": plan[:600]},
            "model": get_model_metadata(llm),
        },
    )
    return PlanResponse(
        queries=queries, plan_summary=plan, model=get_model_metadata(llm)
    )


class ClaimsRequest(BaseModel):
    topic: str
    seed: Optional[int] = 42
    plan_feedback: Optional[str] = None


class ClaimsResponse(BaseModel):
    claims: List[Dict[str, Any]]
    citation_map: Dict[str, Dict[str, str]]
    model: Dict[str, Any]


@app.post("/api/claims", response_model=ClaimsResponse)
def api_claims(req: ClaimsRequest):
    llm = get_llm(seed=req.seed)
    # Guided search queries (reusing plan prompt with constraints)
    pq_text = load_prompt("plan_queries.txt")
    pq_prompt = ChatPromptTemplate.from_template(pq_text)
    guided_topic = (
        f"{req.topic} (constraints: {req.plan_feedback})"
        if (req.plan_feedback or "").strip()
        else req.topic
    )
    queries_text = (pq_prompt | llm | StrOutputParser()).invoke({"topic": guided_topic})
    queries = [q.strip("- ").strip() for q in queries_text.splitlines() if q.strip()][
        :5
    ]
    # Web search + extract + prioritize
    results = research_topic(req.topic, extra_queries=queries, per_query=6)
    enriched = extract_sources_with_content(results)
    prioritized = prioritize_sources(enriched, top_k=12)
    # Extract claims
    ec_text = load_prompt("extract_claims.txt")
    ec_prompt = ChatPromptTemplate.from_template(ec_text)
    raw = (ec_prompt | llm | StrOutputParser()).invoke(
        {"topic": req.topic, "sources": prioritized}
    )
    try:
        import json as _json

        obj = _json.loads(raw)
        claims = obj.get("claims") or []
        citation_map = obj.get("citation_map") or {}
    except Exception:
        claims = [{"id": 1, "text": raw, "citations": []}]
        citation_map = {}
    log_event(
        "api_claims",
        {
            "inputs": {"topic": req.topic, "num_sources": len(prioritized)},
            "prompt": {"extract_claims": ec_text},
            "outputs": {"num_claims": len(claims)},
            "model": get_model_metadata(llm),
        },
    )
    return ClaimsResponse(
        claims=claims, citation_map=citation_map, model=get_model_metadata(llm)
    )


class CompleteRequest(BaseModel):
    topic: str
    seed: Optional[int] = 42
    plan_feedback: Optional[str] = None
    claims_feedback: Optional[str] = None
    human_feedback: Optional[str] = "approve"
    tone_prefs: Optional[str] = ""


class CompleteResponse(BaseModel):
    outline: str
    brief: str
    formatted_brief: str
    model: Dict[str, Any]


@app.post("/api/complete", response_model=CompleteResponse)
def api_complete(req: CompleteRequest):
    llm = get_llm(seed=req.seed)
    # Queries with constraints
    pq_text = load_prompt("plan_queries.txt")
    pq_prompt = ChatPromptTemplate.from_template(pq_text)
    guided_topic = (
        f"{req.topic} (constraints: {req.plan_feedback})"
        if (req.plan_feedback or "").strip()
        else req.topic
    )
    queries_text = (pq_prompt | llm | StrOutputParser()).invoke({"topic": guided_topic})
    queries = [q.strip("- ").strip() for q in queries_text.splitlines() if q.strip()][
        :5
    ]
    # Search pipeline
    results = research_topic(req.topic, extra_queries=queries, per_query=6)
    enriched = extract_sources_with_content(results)
    prioritized = prioritize_sources(enriched, top_k=12)
    # Synthesize outline (nudged by claims_feedback)
    syn_text = load_prompt("synthesize_outline.txt")
    syn_prompt = ChatPromptTemplate.from_template(syn_text)
    topic_hint = req.topic
    if (req.claims_feedback or "").strip() and req.claims_feedback.lower() != "approve":
        topic_hint += f" | Verified-claims-notes: {req.claims_feedback}"
    outline = (syn_prompt | llm | StrOutputParser()).invoke(
        {"topic": topic_hint, "sources": prioritized}
    )
    # Optional refine by human_feedback
    if (req.human_feedback or "").strip() and req.human_feedback.lower() != "approve":
        ref_text = load_prompt("refine_outline.txt")
        ref_prompt = ChatPromptTemplate.from_template(ref_text)
        outline = (ref_prompt | llm | StrOutputParser()).invoke(
            {"outline": outline, "feedback": req.human_feedback}
        )
    # Optional tone apply
    if (req.tone_prefs or "").strip():
        ta_text = load_prompt("adjust_tone.txt")
        ta_prompt = ChatPromptTemplate.from_template(ta_text)
        outline = (ta_prompt | llm | StrOutputParser()).invoke(
            {"outline": outline, "preferences": req.tone_prefs}
        )
    # Final brief + formatting
    fb_text = load_prompt("final_brief.txt")
    fb_prompt = ChatPromptTemplate.from_template(fb_text)
    brief = (fb_prompt | llm | StrOutputParser()).invoke(
        {"topic": req.topic, "outline": outline}
    )
    ff_text = load_prompt("format_brief.txt")
    ff_prompt = ChatPromptTemplate.from_template(ff_text)
    formatted = (ff_prompt | llm | StrOutputParser()).invoke({"brief": brief})
    log_event(
        "api_complete",
        {
            "inputs": {"topic": req.topic},
            "prompt": {
                "synthesize": syn_text,
                "final_brief": fb_text,
                "format": ff_text,
            },
            "outputs": {"outline_len": len(outline), "brief_len": len(brief)},
            "model": get_model_metadata(llm),
        },
    )
    return CompleteResponse(
        outline=outline,
        brief=brief,
        formatted_brief=formatted,
        model=get_model_metadata(llm),
    )
