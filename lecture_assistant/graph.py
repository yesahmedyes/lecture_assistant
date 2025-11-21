from __future__ import annotations

from typing import TypedDict, List, Dict, Literal, Optional

from langchain_core.messages import HumanMessage, SystemMessage
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
    ]


def build_graph(llm: BaseChatModel):
    """
    Pipeline:
      input -> search_plan -> plan_draft -> plan_review -> (replan?) -> web_search
      -> extract -> prioritize -> claims_extract -> claims_review -> synthesize
      -> review -> refine? -> tone_review? -> tone_apply? -> brief -> format
    """
    graph = StateGraph(LectureState)

    def input_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: input")
        print("=" * 60)
        topic = state["topic"].strip()
        seed = int(state.get("seed", 42))
        print(f"   Topic: {topic}")
        print(f"   Seed: {seed}")
        log_event("input", {"inputs": {"topic": topic, "seed": seed}})
        return {"topic": topic, "seed": seed, "status": "input"}

    def search_plan_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: search_plan")
        print("=" * 60)
        topic = state["topic"]
        print(f"   Planning search queries for: {topic}")
        prompt_text = load_prompt("plan_queries.txt")
        prompt = ChatPromptTemplate.from_template(prompt_text)
        chain = prompt | llm | StrOutputParser()
        pf = (state.get("plan_feedback") or "").strip()
        guided_topic = f"{topic} (constraints: {pf})" if pf else topic
        queries_text = chain.invoke({"topic": guided_topic})
        queries = [
            q.strip("- ").strip() for q in queries_text.splitlines() if q.strip()
        ]
        log_event(
            "search_plan",
            {
                "inputs": {"topic": topic, "plan_feedback": pf},
                "prompt": prompt_text,
                "outputs": {"queries_text": queries_text, "queries": queries[:5]},
                "model": get_model_metadata(llm),
            },
        )
        # Clear previously-applied plan_feedback to avoid infinite replan loop
        return {
            "search_queries": queries[:5],
            "plan_feedback": "approve",
            "status": "search_planning",
        }

    def web_search_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: web_search")
        print("=" * 60)
        topic = state["topic"]
        extra = state.get("search_queries") or []
        print(f"   Searching with {len(extra)} queries...")
        results = research_topic(topic, extra_queries=extra, per_query=6)
        log_event(
            "web_search",
            {
                "inputs": {"topic": topic, "queries": extra},
                "outputs": {"num_results": len(results)},
            },
        )
        return {"search_results": results, "status": "searching"}

    def plan_draft_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: plan_draft")
        print("=" * 60)
        topic = state["topic"]
        queries = state.get("search_queries", [])
        print(f"   Drafting plan with {len(queries)} queries...")
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
        return {"plan_summary": plan, "status": "plan_drafting"}

    def plan_review_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: plan_review")
        print("=" * 60)
        existing = (state.get("plan_feedback") or "").strip()
        if existing:
            log_event(
                "hitl_plan_review",
                {
                    "inputs": {"plan_len": len(state.get("plan_summary", ""))},
                    "outputs": {"decision": existing},
                },
            )
            return {"plan_feedback": existing, "status": "plan_review"}
        print("\n=== PLAN DRAFT ===\n")
        print(state.get("plan_summary", ""))
        print("\nOptions:")
        print("  [1] Approve and continue")
        print("  [2] Revise plan (enter constraints/preferences)")
        try:
            choice = input("Choose 1 or 2: ").strip()
        except EOFError:
            choice = "1"
        feedback = "approve"
        if choice == "2":
            try:
                feedback = input("Enter constraints/preferences: ").strip() or "approve"
            except EOFError:
                feedback = "approve"
        log_event(
            "hitl_plan_review",
            {
                "inputs": {"plan_len": len(state.get("plan_summary", ""))},
                "outputs": {"decision": feedback},
            },
        )
        return {"plan_feedback": feedback, "status": "plan_review"}

    def needs_replan(state: LectureState) -> Literal["replan", "continue"]:
        fb = (state.get("plan_feedback") or "").strip().lower()
        decision = "replan" if fb and fb != "approve" else "continue"
        print(f"   ⚡ Decision: {decision} (feedback: {fb or 'none'})")
        return decision

    def synthesize_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: synthesize")
        print("=" * 60)
        prompt_text = load_prompt("synthesize_outline.txt")
        prompt = ChatPromptTemplate.from_template(prompt_text)
        chain = prompt | llm | StrOutputParser()
        sources = state.get("prioritized_sources", [])
        print(f"   Synthesizing outline from {len(sources)} sources...")
        topic_hint = state["topic"]
        pf = (state.get("plan_feedback") or "").strip()
        cf = (state.get("claims_feedback") or "").strip()
        if pf and pf.lower() != "approve":
            topic_hint += f" | Constraints: {pf}"
        if cf and cf.lower() != "approve":
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
        return {"outline": outline, "status": "synthesizing"}

    def extract_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: extract")
        print("=" * 60)
        results = state.get("search_results", [])
        print(f"   Extracting content from {len(results)} search results...")
        enriched = extract_sources_with_content(results)
        log_event(
            "extract",
            {
                "inputs": {"num_results": len(results)},
                "outputs": {"num_enriched": len(enriched)},
            },
        )
        return {"extracted_sources": enriched, "status": "extracting"}

    def prioritize_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: prioritize")
        print("=" * 60)
        enriched = state.get("extracted_sources", [])
        print(f"   Prioritizing {len(enriched)} sources...")
        prioritized = prioritize_sources(enriched, top_k=12)
        log_event(
            "author_prioritization",
            {
                "inputs": {"num_enriched": len(enriched)},
                "outputs": {"num_prioritized": len(prioritized)},
            },
        )
        return {"prioritized_sources": prioritized, "status": "prioritizing"}

    def claims_extract_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: claims_extract")
        print("=" * 60)
        sources = state.get("prioritized_sources", [])
        print(f"   Extracting claims from {len(sources)} sources...")
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
        }

    def claims_review_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: claims_review")
        print("=" * 60)
        existing = (state.get("claims_feedback") or "").strip()
        if existing:
            log_event(
                "hitl_claims_review",
                {
                    "inputs": {"num_claims": len(state.get("claims", []))},
                    "outputs": {"decision": existing},
                },
            )
            return {"claims_feedback": existing, "status": "claims_review"}
        claims = state.get("claims", []) or []
        print("\n=== FACT VERIFICATION: EXTRACTED CLAIMS ===\n")
        for c in claims[:6]:
            idx = c.get("id")
            text = c.get("text")
            cites = c.get("citations") or []
            print(f"[{idx}] {text}  (sources: {cites})")
        print("\nOptions:")
        print("  [1] Approve claims")
        print("  [2] Flag claims (enter indices and notes)")
        try:
            choice = input("Choose 1 or 2: ").strip()
        except EOFError:
            choice = "1"
        fb = "approve"
        if choice == "2":
            try:
                fb = (
                    input("Enter e.g. '2,4 - 2 unclear; 4 outdated': ").strip()
                    or "approve"
                )
            except EOFError:
                fb = "approve"
        log_event(
            "hitl_claims_review",
            {"inputs": {"num_claims": len(claims)}, "outputs": {"decision": fb}},
        )
        return {"claims_feedback": fb, "status": "claims_review"}

    def review_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: review")
        print("=" * 60)
        # Human-in-the-loop via interactive input; non-interactive pipelines can pass feedback via state.
        existing_feedback = state.get("human_feedback", "")
        if existing_feedback:
            log_event(
                "hitl_review",
                {
                    "inputs": {"outline_len": len(state.get("outline", ""))},
                    "outputs": {"feedback": existing_feedback},
                },
            )
            return {"human_feedback": existing_feedback, "status": "review"}
        print("\n--- OUTLINE DRAFT ---\n")
        print(state.get("outline", ""))
        print("\nPlease review the outline above.")
        print("Type your feedback and press Enter. Type 'approve' to accept as-is.")
        try:
            feedback = input("Your feedback (or 'approve'): ").strip()
        except EOFError:
            feedback = "approve"
        log_event(
            "hitl_review",
            {
                "inputs": {"outline_len": len(state.get("outline", ""))},
                "outputs": {"feedback": feedback or "approve"},
            },
        )
        return {"human_feedback": feedback or "approve", "status": "review"}

    def refinement_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: refine")
        print("=" * 60)
        feedback = state.get("human_feedback", "")
        outline = state.get("outline", "")
        print(f"   Refining outline based on feedback...")
        if not feedback or feedback.lower() == "approve":
            return {"outline": outline, "status": "refining"}
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
        return {"outline": revised, "status": "refining"}

    def tone_review_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: tone_review")
        print("=" * 60)
        existing = (state.get("tone_prefs") or "").strip()
        if existing:
            log_event(
                "hitl_tone_review",
                {
                    "inputs": {"outline_len": len(state.get("outline", ""))},
                    "outputs": {"tone_prefs": existing},
                },
            )
            return {"tone_prefs": existing, "status": "tone_review"}
        print("\n=== OPTIONAL TONE/FOCUS ADJUSTMENT ===")
        print(
            "Would you like to adjust tone or focus? Examples: 'beginner-friendly', 'industry focus', 'math-heavy'."
        )
        print("Options: [1] Skip  [2] Enter preferences")
        try:
            choice = input("Choose 1 or 2: ").strip()
        except EOFError:
            choice = "1"
        prefs = ""
        if choice == "2":
            try:
                prefs = input("Enter tone/focus preferences: ").strip()
            except EOFError:
                prefs = ""
        log_event(
            "hitl_tone_review",
            {
                "inputs": {"outline_len": len(state.get("outline", ""))},
                "outputs": {"tone_prefs": prefs or "skip"},
            },
        )
        return {"tone_prefs": prefs, "status": "tone_review"}

    def tone_apply_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: tone_apply")
        print("=" * 60)
        prefs = (state.get("tone_prefs") or "").strip()
        print(f"   Applying tone preferences: {prefs}")
        if not prefs:
            return {"outline": state.get("outline", ""), "status": "tone_applying"}
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
        return {"outline": revised, "status": "tone_applying"}

    def final_brief_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: brief (final)")
        print("=" * 60)
        print(f"   Generating final brief for: {state['topic']}")
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
        return {"brief": brief, "status": "final"}

    def formatting_node(state: LectureState) -> LectureState:
        print("\n" + "=" * 60)
        print(f"🔵 NODE: format")
        print("=" * 60)
        print(f"   Formatting final brief...")
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
        return {"formatted_brief": formatted, "status": "formatting"}

    def needs_revision(state: LectureState) -> Literal["refine", "brief"]:
        feedback = (state.get("human_feedback") or "").strip().lower()
        decision = "refine" if feedback and feedback != "approve" else "brief"
        print(f"   ⚡ Decision: {decision} (feedback: {feedback or 'none'})")
        return decision

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
    graph.add_node("brief", final_brief_node)
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
        "review", needs_revision, {"refine": "refine", "brief": "brief"}
    )
    graph.add_edge("refine", "tone_review")

    # Tone review branch
    def tone_next(state: LectureState) -> Literal["apply", "skip"]:
        prefs = (state.get("tone_prefs") or "").strip()
        decision = "apply" if prefs else "skip"
        print(f"   ⚡ Decision: {decision} tone preferences")
        return decision

    graph.add_conditional_edges(
        "tone_review", tone_next, {"apply": "tone_apply", "skip": "brief"}
    )
    graph.add_edge("tone_apply", "brief")
    graph.add_edge("brief", "format")
    graph.add_edge("format", END)

    memory = MemorySaver()
    return graph.compile(checkpointer=memory)
