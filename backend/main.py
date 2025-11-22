from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from .llm_factory import get_llm
from .graph import build_graph, LectureState

# Load environment variables
load_dotenv(override=False)

app = FastAPI(
    title="Lecture Assistant API",
    description="Research assistant that generates lecture briefs with human-in-the-loop checkpoints",
    version="1.0.0",
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for active sessions (use Redis/DB in production)
active_sessions: Dict[str, Dict[str, Any]] = {}
session_logs: Dict[str, List[Dict[str, Any]]] = {}


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================


class StartSessionRequest(BaseModel):
    topic: str = Field(..., description="The lecture topic to research")
    model: Optional[str] = Field(None, description="LLM model name")
    temperature: float = Field(0.2, ge=0.0, le=2.0, description="LLM temperature")
    seed: int = Field(42, description="Random seed for reproducibility")


class StartSessionResponse(BaseModel):
    session_id: str
    status: str
    message: str


class SessionStatusResponse(BaseModel):
    session_id: str
    status: str
    current_node: Optional[str]
    waiting_for_human: bool
    checkpoint_type: Optional[str]
    checkpoint_data: Optional[Dict[str, Any]]


class HumanFeedbackRequest(BaseModel):
    decision: str = Field(..., description="Human decision (approve/feedback text)")
    additional_data: Optional[Dict[str, Any]] = Field(
        None, description="Additional context"
    )


class SessionResult(BaseModel):
    session_id: str
    topic: str
    status: str
    final_brief: Optional[str]
    formatted_brief: Optional[str]
    outline: Optional[str]
    sources: Optional[List[Dict[str, str]]]
    claims: Optional[List[Dict[str, Any]]]


class LogEntry(BaseModel):
    timestamp: float
    node: str
    inputs: Optional[Dict[str, Any]]
    outputs: Optional[Dict[str, Any]]
    prompt: Optional[str]
    model: Optional[Dict[str, Any]]


class LogsResponse(BaseModel):
    session_id: str
    logs: List[LogEntry]
    node_trace: List[str]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def get_checkpoint_data(state: LectureState, status: str) -> Optional[Dict[str, Any]]:
    """Extract relevant data for human checkpoints."""
    if status == "plan_review":
        return {
            "type": "plan_review",
            "plan_summary": state.get("plan_summary", ""),
            "queries": state.get("search_queries", []),
            "options": [
                {"id": "approve", "label": "Approve and continue"},
                {"id": "revise", "label": "Revise plan", "requires_input": True},
            ],
        }
    elif status == "claims_review":
        claims = state.get("claims", [])[:6]
        return {
            "type": "claims_review",
            "claims": claims,
            "citation_map": state.get("citation_map", {}),
            "options": [
                {"id": "approve", "label": "Approve claims"},
                {"id": "flag", "label": "Flag claims", "requires_input": True},
            ],
        }
    elif status == "tone_review":
        return {
            "type": "tone_review",
            "outline_preview": state.get("outline", "")[:500],
            "options": [
                {"id": "skip", "label": "Skip tone adjustment"},
                {"id": "adjust", "label": "Adjust tone/focus", "requires_input": True},
            ],
        }
    return None


def load_session_logs(session_id: str) -> List[Dict[str, Any]]:
    """Load logs from disk for a session."""
    logs_dir = "logs"
    if not os.path.exists(logs_dir):
        return []

    all_logs = []
    for filename in os.listdir(logs_dir):
        if filename.endswith(".jsonl"):
            filepath = os.path.join(logs_dir, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                for line in f:
                    try:
                        entry = json.loads(line.strip())
                        all_logs.append(entry)
                    except json.JSONDecodeError:
                        continue

    # Sort by timestamp
    all_logs.sort(key=lambda x: x.get("ts", 0))
    return all_logs


# ============================================================================
# API ENDPOINTS
# ============================================================================


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "name": "Lecture Assistant API",
        "version": "1.0.0",
        "status": "running",
    }


@app.post("/sessions/start", response_model=StartSessionResponse)
async def start_session(
    request: StartSessionRequest, background_tasks: BackgroundTasks
):
    """
    Start a new lecture research session.
    The session will run in the background and pause at human checkpoints.
    """
    session_id = str(uuid.uuid4())

    # Initialize session
    active_sessions[session_id] = {
        "topic": request.topic,
        "status": "initializing",
        "created_at": datetime.utcnow().isoformat(),
        "model": request.model,
        "temperature": request.temperature,
        "seed": request.seed,
        "state": None,
        "waiting_for_human": False,
        "checkpoint_type": None,
    }

    # Start async processing
    background_tasks.add_task(run_session, session_id, request)

    return StartSessionResponse(
        session_id=session_id,
        status="started",
        message=f"Session started for topic: {request.topic}",
    )


async def run_session(session_id: str, request: StartSessionRequest):
    """
    Run the LangGraph pipeline for a session.
    This runs in the background and pauses at checkpoints.
    """
    try:
        session = active_sessions[session_id]

        # Build graph
        llm = get_llm(
            model=request.model,
            temperature=request.temperature,
            seed=request.seed,
        )
        app_graph = build_graph(llm)

        # Initial state
        initial_state: LectureState = {
            "topic": request.topic,
            "seed": request.seed,
        }

        session["status"] = "running"

        # Run graph step by step
        config = {
            "recursion_limit": 50,
            "configurable": {"thread_id": session_id},
        }

        # For this implementation, we'll run the full graph
        # In a production system, you'd want to implement step-by-step execution
        # with proper checkpoint handling
        final_state = app_graph.invoke(initial_state, config=config)

        # Store final state
        session["state"] = final_state
        session["status"] = "completed"
        session["completed_at"] = datetime.utcnow().isoformat()

    except Exception as e:
        if session_id in active_sessions:
            active_sessions[session_id]["status"] = "failed"
            active_sessions[session_id]["error"] = str(e)


@app.get("/sessions/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(session_id: str):
    """Get the current status of a session."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = active_sessions[session_id]
    state = session.get("state", {})
    current_status = state.get("status") if state else session.get("status")

    # Determine if waiting for human input
    waiting_statuses = ["plan_review", "claims_review", "review", "tone_review"]
    waiting_for_human = current_status in waiting_statuses

    checkpoint_data = None
    checkpoint_type = None
    if waiting_for_human and state:
        checkpoint_data = get_checkpoint_data(state, current_status)
        checkpoint_type = current_status

    return SessionStatusResponse(
        session_id=session_id,
        status=session.get("status", "unknown"),
        current_node=current_status,
        waiting_for_human=waiting_for_human,
        checkpoint_type=checkpoint_type,
        checkpoint_data=checkpoint_data,
    )


@app.post("/sessions/{session_id}/feedback")
async def submit_feedback(
    session_id: str,
    checkpoint_type: str,
    feedback: HumanFeedbackRequest,
):
    """
    Submit human feedback at a checkpoint.

    checkpoint_type: plan_review, claims_review, review, tone_review
    """
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = active_sessions[session_id]
    state = session.get("state", {})

    # Update state based on checkpoint type
    if checkpoint_type == "plan_review":
        state["plan_feedback"] = feedback.decision
    elif checkpoint_type == "claims_review":
        state["claims_feedback"] = feedback.decision
    elif checkpoint_type == "review":
        state["human_feedback"] = feedback.decision
    elif checkpoint_type == "tone_review":
        state["tone_prefs"] = feedback.decision
    else:
        raise HTTPException(
            status_code=400, detail=f"Unknown checkpoint type: {checkpoint_type}"
        )

    session["state"] = state
    session["waiting_for_human"] = False

    return {
        "session_id": session_id,
        "checkpoint_type": checkpoint_type,
        "status": "feedback_received",
        "message": "Feedback submitted successfully. Processing will continue.",
    }


@app.get("/sessions/{session_id}/result", response_model=SessionResult)
async def get_session_result(session_id: str):
    """Get the final result of a completed session."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = active_sessions[session_id]
    state = session.get("state", {})

    if session.get("status") not in ["completed", "running"]:
        raise HTTPException(
            status_code=400,
            detail=f"Session is not complete. Current status: {session.get('status')}",
        )

    return SessionResult(
        session_id=session_id,
        topic=session.get("topic", ""),
        status=session.get("status", "unknown"),
        final_brief=state.get("brief"),
        formatted_brief=state.get("formatted_brief"),
        outline=state.get("outline"),
        sources=state.get("prioritized_sources"),
        claims=state.get("claims"),
    )


@app.get("/sessions/{session_id}/logs", response_model=LogsResponse)
async def get_session_logs(session_id: str):
    """Get all logs for a session."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    logs = load_session_logs(session_id)

    # Extract node trace
    node_trace = [log.get("node", "") for log in logs if log.get("node")]

    # Format logs
    formatted_logs = []
    for log in logs:
        formatted_logs.append(
            LogEntry(
                timestamp=log.get("ts", 0),
                node=log.get("node", ""),
                inputs=log.get("inputs"),
                outputs=log.get("outputs"),
                prompt=log.get("prompt"),
                model=log.get("model"),
            )
        )

    return LogsResponse(
        session_id=session_id,
        logs=formatted_logs,
        node_trace=node_trace,
    )


@app.get("/sessions")
async def list_sessions():
    """List all active sessions."""
    sessions = []
    for session_id, session_data in active_sessions.items():
        sessions.append(
            {
                "session_id": session_id,
                "topic": session_data.get("topic"),
                "status": session_data.get("status"),
                "created_at": session_data.get("created_at"),
                "completed_at": session_data.get("completed_at"),
            }
        )
    return {"sessions": sessions, "total": len(sessions)}


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    del active_sessions[session_id]
    if session_id in session_logs:
        del session_logs[session_id]

    return {
        "session_id": session_id,
        "status": "deleted",
        "message": "Session deleted successfully",
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "active_sessions": len(active_sessions),
        "environment": {
            "tavily_api_key_set": bool(os.getenv("TAVILY_API_KEY")),
            "openai_api_key_set": bool(os.getenv("OPENAI_API_KEY")),
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
