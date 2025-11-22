from __future__ import annotations

from typing import TypedDict, List, Dict, Literal, Optional
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.language_models.chat_models import BaseChatModel
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .research import research_topic
from .extract import extract_sources_with_content, prioritize_sources
from .logging_utils import log_event, get_model_metadata, load_prompt


class LectureState(TypedDict, total=False):
    topic: str
    seed: int
    # Search
    search_queries: List[str]
    search_results: List[Dict[str, str]]
    plan_summary: str
    plan_feedback: str
    # Extraction
    extracted_sources: List[Dict[str, str]]
    # Prioritization
    prioritized_sources: List[Dict[str, str]]
    # Claims
    claims: List[Dict[str, object]]
    citation_map: Dict[str, Dict[str, str]]
    claims_feedback: str
    # Authoring
    outline: str
    human_feedback: str
    tone_prefs: str
    brief: str
    formatted_brief: str
    status: Literal[
        "input",
        "search_planning",
        "plan_drafting",
        "plan_review",
        "searching",
        "extracting",
        "prioritizing",
        "claims_extracting",
        "claims_review",
        "synthesizing",
        "review",
        "refining",
        "tone_review",
        "tone_applying",
        "final",
        "formatting",
        "completed",
    ]
    # Control flags for web-based HITL
    _waiting_for_human: bool
    _checkpoint_type: Optional[str]


def build_graph_async(llm: BaseChatModel):
    """
    Build a graph that works with web-based HITL.
    Checkpoints set flags instead of calling input().
    """
    graph = StateGraph(LectureState)

    def input_node(state: LectureState) -> LectureState:
        print("🔵 input")
        topic = state["topic"].strip()
        seed = int(state.get("seed", 42))
        log_event("input", {"inputs": {"topic": topic, "seed": seed}})
        return {
            "topic": topic,
            "seed": seed,
            "status": "input",
            "_waiting_for_human": False,
        }

    def search_plan_node(state: LectureState) -> LectureState:
        topic = state["topic"]
        prompt_text = load_prompt("plan_queries.txt")
        prompt = ChatPromptTemplate.from_template(prompt_text)
        chain = prompt | llm | StrOutputParser()
        pf = (state.get("plan_feedback") or "").strip()
        guided_topic = (
            f"{topic} (constraints: {pf})" if pf and pf != "approve" else topic
        )
        queries_text = chain.invoke({"topic": guided_topic})
        queries = [
            q.strip("- ").strip() for q in queries_text.splitlines() if q.strip()
        ]
        num_queries = len(queries[:5])
        print(f"🔵 search_plan ({num_queries} queries)")
        log_event(
            "search_plan",
            {
                "inputs": {"topic": topic, "plan_feedback": pf},
                "prompt": prompt_text,
                "outputs": {"queries_text": queries_text, "queries": queries[:5]},
                "model": get_model_metadata(llm),
            },
        )
        return {
            "search_queries": queries[:5],
            "status": "search_planning",
            "_waiting_for_human": False,
        }

    def web_search_node(state: LectureState) -> LectureState:
        topic = state["topic"]
        extra = state.get("search_queries") or []
        num_queries = len(extra)
        results = research_topic(topic, extra_queries=extra, per_query=6)
        num_results = len(results)
        print(f"🔵 web_search ({num_queries} queries → {num_results} results)")
        log_event(
            "web_search",
            {
                "inputs": {"topic": topic, "queries": extra},
                "outputs": {"num_results": num_results},
            },
        )
        return {
            "search_results": results,
            "status": "searching",
            "_waiting_for_human": False,
        }

    def plan_draft_node(state: LectureState) -> LectureState:
        print("🔵 plan_draft")
        topic = state["topic"]
        queries = state.get("search_queries", [])
        prompt_text = load_prompt("plan_brief.txt")
        prompt = ChatPromptTemplate.from_template(prompt_text)
        chain = prompt | llm | StrOutputParser()
        plan = chain.invoke({"topic": topic, "queries": "\n".join(queries)})
        log_event(
            "plan_draft",
            {
                "inputs": {"topic": topic, "num_queries": len(queries)},
                "prompt": prompt_text,
                "outputs": {"plan_len": len(plan), "plan_preview": plan[:1200]},
                "model": get_model_metadata(llm),
            },
        )
        return {
            "plan_summary": plan,
            "status": "plan_drafting",
            "_waiting_for_human": False,
        }

    def plan_review_node(state: LectureState) -> LectureState:
        print("🔵 plan_review (HITL checkpoint)")
        existing = (state.get("plan_feedback") or "").strip()

        # If no feedback yet, wait for human
        if not existing or existing == "pending":
            log_event(
                "hitl_plan_review",
                {
                    "inputs": {"plan_len": len(state.get("plan_summary", ""))},
                    "outputs": {"decision": "waiting"},
                },
            )
            return {
                "plan_feedback": "pending",
                "status": "plan_review",
                "_waiting_for_human": True,
                "_checkpoint_type": "plan_review",
            }

        # Feedback received, log and continue
        log_event(
            "hitl_plan_review",
            {
                "inputs": {"plan_len": len(state.get("plan_summary", ""))},
                "outputs": {"decision": existing},
            },
        )
        return {
            "plan_feedback": existing,
            "status": "plan_review",
            "_waiting_for_human": False,
            "_checkpoint_type": None,
        }

    def needs_replan(state: LectureState) -> Literal["replan", "continue"]:
        fb = (state.get("plan_feedback") or "").strip().lower()
        decision = "replan" if fb and fb not in ("approve", "pending") else "continue"
        return decision

    def synthesize_node(state: LectureState) -> LectureState:
        print("🔵 synthesize")
        prompt_text = load_prompt("synthesize_outline.txt")
        prompt = ChatPromptTemplate.from_template(prompt_text)
        chain = prompt | llm | StrOutputParser()
        sources = state.get("prioritized_sources", [])
        topic_hint = state["topic"]
        pf = (state.get("plan_feedback") or "").strip()
        cf = (state.get("claims_feedback") or "").strip()
        if pf and pf.lower() not in ("approve", "pending"):
            topic_hint += f" | Constraints: {pf}"
        if cf and cf.lower() not in ("approve", "pending"):
            topic_hint += f" | Verified-claims-notes: {cf}"
        outline = chain.invoke({"topic": topic_hint, "sources": sources})
        log_event(
            "synthesis",
            {
                "inputs": {"topic": state["topic"], "num_sources": len(sources)},
                "prompt": prompt_text,
                "outputs": {
                    "outline_len": len(outline),
                    "outline_preview": outline[:1200],
                },
                "model": get_model_metadata(llm),
            },
        )
        return {
            "outline": outline,
            "status": "synthesizing",
            "_waiting_for_human": False,
        }

    def extract_node(state: LectureState) -> LectureState:
        print("🔵 extract")
        results = state.get("search_results", [])
        enriched = extract_sources_with_content(results)
        log_event(
            "extract",
            {
                "inputs": {"num_results": len(results)},
                "outputs": {"num_enriched": len(enriched)},
            },
        )
        return {
            "extracted_sources": enriched,
            "status": "extracting",
            "_waiting_for_human": False,
        }

    def prioritize_node(state: LectureState) -> LectureState:
        print("🔵 prioritize")
        enriched = state.get("extracted_sources", [])
        prioritized = prioritize_sources(enriched, top_k=12)
        log_event(
            "author_prioritization",
            {
                "inputs": {"num_enriched": len(enriched)},
                "outputs": {"num_prioritized": len(prioritized)},
            },
        )
        return {
            "prioritized_sources": prioritized,
            "status": "prioritizing",
            "_waiting_for_human": False,
        }

    def claims_extract_node(state: LectureState) -> LectureState:
        print("🔵 claims_extract")
        sources = state.get("prioritized_sources", [])
        prompt_text = load_prompt("extract_claims.txt")
        prompt = ChatPromptTemplate.from_template(prompt_text)
        chain = prompt | llm | StrOutputParser()
        raw = chain.invoke({"topic": state["topic"], "sources": sources})
        claims: List[Dict[str, object]] = []
        citation_map: Dict[str, Dict[str, str]] = {}
        try:
            import json as _json

            obj = _json.loads(raw)
            claims = obj.get("claims") or []
            citation_map = obj.get("citation_map") or {}
        except Exception:
            claims = [{"id": 1, "text": raw, "citations": []}]
            citation_map = {}
        log_event(
            "claims_extract",
            {
                "inputs": {"num_sources": len(sources)},
                "prompt": prompt_text,
                "outputs": {
                    "num_claims": len(claims),
                    "claims_preview": [c.get("text") for c in claims[:3]],
                },
                "model": get_model_metadata(llm),
            },
        )
        return {
            "claims": claims,
            "citation_map": citation_map,
            "status": "claims_extracting",
            "_waiting_for_human": False,
        }

    def claims_review_node(state: LectureState) -> LectureState:
        print("🔵 claims_review (HITL checkpoint)")
        existing = (state.get("claims_feedback") or "").strip()

        if not existing or existing == "pending":
            log_event(
                "hitl_claims_review",
                {
                    "inputs": {"num_claims": len(state.get("claims", []))},
                    "outputs": {"decision": "waiting"},
                },
            )
            return {
                "claims_feedback": "pending",
                "status": "claims_review",
                "_waiting_for_human": True,
                "_checkpoint_type": "claims_review",
            }

        log_event(
            "hitl_claims_review",
            {
                "inputs": {"num_claims": len(state.get("claims", []))},
                "outputs": {"decision": existing},
            },
        )
        return {
            "claims_feedback": existing,
            "status": "claims_review",
            "_waiting_for_human": False,
            "_checkpoint_type": None,
        }

    def review_node(state: LectureState) -> LectureState:
        print("🔵 review (HITL checkpoint)")
        existing_feedback = state.get("human_feedback", "")

        if not existing_feedback or existing_feedback == "pending":
            log_event(
                "hitl_review",
                {
                    "inputs": {"outline_len": len(state.get("outline", ""))},
                    "outputs": {"feedback": "waiting"},
                },
            )
            return {
                "human_feedback": "pending",
                "status": "review",
                "_waiting_for_human": True,
                "_checkpoint_type": "review",
            }

        log_event(
            "hitl_review",
            {
                "inputs": {"outline_len": len(state.get("outline", ""))},
                "outputs": {"feedback": existing_feedback},
            },
        )
        return {
            "human_feedback": existing_feedback,
            "status": "review",
            "_waiting_for_human": False,
            "_checkpoint_type": None,
        }

    def refinement_node(state: LectureState) -> LectureState:
        print("🔵 refine")
        feedback = state.get("human_feedback", "")
        outline = state.get("outline", "")
        if not feedback or feedback.lower() in ("approve", "pending"):
            return {
                "outline": outline,
                "status": "refining",
                "_waiting_for_human": False,
            }
        prompt_text = load_prompt("refine_outline.txt")
        prompt = ChatPromptTemplate.from_template(prompt_text)
        chain = prompt | llm | StrOutputParser()
        revised = chain.invoke({"outline": outline, "feedback": feedback})
        log_event(
            "refinement",
            {
                "inputs": {"feedback": feedback[:500]},
                "prompt": prompt_text,
                "outputs": {
                    "revised_len": len(revised),
                    "revised_preview": revised[:1200],
                },
                "model": get_model_metadata(llm),
            },
        )
        return {
            "outline": revised,
            "status": "refining",
            "_waiting_for_human": False,
        }

    def tone_review_node(state: LectureState) -> LectureState:
        print("🔵 tone_review (HITL checkpoint - optional)")
        existing = (state.get("tone_prefs") or "").strip()

        if existing == "pending":
            log_event(
                "hitl_tone_review",
                {
                    "inputs": {"outline_len": len(state.get("outline", ""))},
                    "outputs": {"tone_prefs": "waiting"},
                },
            )
            return {
                "tone_prefs": "pending",
                "status": "tone_review",
                "_waiting_for_human": True,
                "_checkpoint_type": "tone_review",
            }

        log_event(
            "hitl_tone_review",
            {
                "inputs": {"outline_len": len(state.get("outline", ""))},
                "outputs": {"tone_prefs": existing or "skip"},
            },
        )
        return {
            "tone_prefs": existing or "",
            "status": "tone_review",
            "_waiting_for_human": False,
            "_checkpoint_type": None,
        }

    def tone_apply_node(state: LectureState) -> LectureState:
        print("🔵 tone_apply")
        prefs = (state.get("tone_prefs") or "").strip()
        if not prefs or prefs in ("skip", "pending"):
            return {
                "outline": state.get("outline", ""),
                "status": "tone_applying",
                "_waiting_for_human": False,
            }
        prompt_text = load_prompt("adjust_tone.txt")
        prompt = ChatPromptTemplate.from_template(prompt_text)
        chain = prompt | llm | StrOutputParser()
        revised = chain.invoke(
            {"outline": state.get("outline", ""), "preferences": prefs}
        )
        log_event(
            "tone_apply",
            {
                "inputs": {"prefs": prefs[:200]},
                "prompt": prompt_text,
                "outputs": {
                    "revised_len": len(revised),
                    "revised_preview": revised[:1200],
                },
                "model": get_model_metadata(llm),
            },
        )
        return {
            "outline": revised,
            "status": "tone_applying",
            "_waiting_for_human": False,
        }

    def final_brief_node(state: LectureState) -> LectureState:
        print("🔵 generate_brief")
        prompt_text = load_prompt("final_brief.txt")
        prompt = ChatPromptTemplate.from_template(prompt_text)
        chain = prompt | llm | StrOutputParser()
        brief = chain.invoke(
            {"topic": state["topic"], "outline": state.get("outline", "")}
        )
        log_event(
            "final_brief",
            {
                "inputs": {"topic": state["topic"]},
                "prompt": prompt_text,
                "outputs": {"brief_len": len(brief), "brief_preview": brief[:1200]},
                "model": get_model_metadata(llm),
            },
        )
        return {
            "brief": brief,
            "status": "final",
            "_waiting_for_human": False,
        }

    def formatting_node(state: LectureState) -> LectureState:
        print("🔵 format")
        prompt_text = load_prompt("format_brief.txt")
        prompt = ChatPromptTemplate.from_template(prompt_text)
        chain = prompt | llm | StrOutputParser()
        brief = state.get("brief", "")
        formatted = chain.invoke({"brief": brief})
        log_event(
            "formatting",
            {
                "inputs": {"brief_len": len(brief)},
                "prompt": prompt_text,
                "outputs": {
                    "formatted_len": len(formatted),
                    "formatted_preview": formatted[:1200],
                },
                "model": get_model_metadata(llm),
            },
        )
        return {
            "formatted_brief": formatted,
            "status": "completed",
            "_waiting_for_human": False,
        }

    def needs_revision(state: LectureState) -> Literal["refine", "generate_brief"]:
        feedback = (state.get("human_feedback") or "").strip().lower()
        decision = (
            "refine"
            if feedback and feedback not in ("approve", "pending")
            else "generate_brief"
        )
        return decision

    # Build graph
    graph.add_node("input", input_node)
    graph.add_node("search_plan", search_plan_node)
    graph.add_node("plan_draft", plan_draft_node)
    graph.add_node("plan_review", plan_review_node)
    graph.add_node("web_search", web_search_node)
    graph.add_node("extract", extract_node)
    graph.add_node("prioritize", prioritize_node)
    graph.add_node("claims_extract", claims_extract_node)
    graph.add_node("claims_review", claims_review_node)
    graph.add_node("synthesize", synthesize_node)
    graph.add_node("review", review_node)
    graph.add_node("refine", refinement_node)
    graph.add_node("tone_review", tone_review_node)
    graph.add_node("tone_apply", tone_apply_node)
    graph.add_node("generate_brief", final_brief_node)
    graph.add_node("format", formatting_node)

    graph.set_entry_point("input")
    graph.add_edge("input", "search_plan")
    graph.add_edge("search_plan", "plan_draft")
    graph.add_edge("plan_draft", "plan_review")
    graph.add_conditional_edges(
        "plan_review", needs_replan, {"replan": "search_plan", "continue": "web_search"}
    )
    graph.add_edge("web_search", "extract")
    graph.add_edge("extract", "prioritize")
    graph.add_edge("prioritize", "claims_extract")
    graph.add_edge("claims_extract", "claims_review")
    graph.add_edge("claims_review", "synthesize")
    graph.add_edge("synthesize", "review")
    graph.add_conditional_edges(
        "review",
        needs_revision,
        {"refine": "refine", "generate_brief": "generate_brief"},
    )
    graph.add_edge("refine", "tone_review")

    def tone_next(state: LectureState) -> Literal["apply", "skip"]:
        prefs = (state.get("tone_prefs") or "").strip()
        decision = "apply" if prefs and prefs not in ("skip", "pending") else "skip"
        return decision

    graph.add_conditional_edges(
        "tone_review", tone_next, {"apply": "tone_apply", "skip": "generate_brief"}
    )
    graph.add_edge("tone_apply", "generate_brief")
    graph.add_edge("generate_brief", "format")
    graph.add_edge("format", END)

    # CRITICAL: Add checkpointer for pause/resume functionality
    memory = MemorySaver()
    return graph.compile(checkpointer=memory)
