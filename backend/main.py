from __future__ import annotations

import os
import uuid
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from .llm_factory import get_llm
from .graph_async import build_graph_async, LectureState

# Load environment variables
load_dotenv(override=False)

app = FastAPI(
    title="Lecture Assistant API",
    description="Research assistant with WebSocket-powered HITL",
    version="2.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_sessions: Dict[str, Dict[str, Any]] = {}
session_graphs: Dict[str, Any] = {}


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)
        print(
            f"🔌 WebSocket connected for session {session_id[:8]} (total: {len(self.active_connections[session_id])})"
        )

    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.active_connections:
            self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
                print(f"🔌 All WebSockets disconnected for session {session_id[:8]}")

    async def send_update(self, session_id: str, message: dict):
        if session_id not in self.active_connections:
            print(f"⚠️  No WebSocket connections for session {session_id[:8]}")
            return

        num_connections = len(self.active_connections[session_id])
        print(
            f"📡 Broadcasting to {num_connections} connection(s) for {session_id[:8]}: {message.get('type')}"
        )

        dead_connections = []
        for connection in self.active_connections[session_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"❌ Failed to send to connection: {e}")
                dead_connections.append(connection)

        # Clean up dead connections
        for conn in dead_connections:
            self.disconnect(conn, session_id)


manager = ConnectionManager()


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
    decision: str = Field(..., description="Human decision")
    additional_data: Optional[Dict[str, Any]] = None


class SessionResult(BaseModel):
    session_id: str
    topic: str
    status: str
    final_brief: Optional[str]
    formatted_brief: Optional[str]
    outline: Optional[str]
    sources: Optional[List[Dict[str, str]]]
    claims: Optional[List[Dict[str, Any]]]


def get_checkpoint_data(
    state: Dict[str, Any], checkpoint_type: str
) -> Optional[Dict[str, Any]]:
    """Extract checkpoint data for frontend."""
    if checkpoint_type == "plan_review":
        return {
            "type": "plan_review",
            "plan_summary": state.get("plan_summary", ""),
            "queries": state.get("search_queries", []),
            "options": [
                {"id": "approve", "label": "Approve and continue"},
                {"id": "revise", "label": "Revise plan", "requires_input": True},
            ],
        }
    elif checkpoint_type == "claims_review":
        return {
            "type": "claims_review",
            "claims": state.get("claims", [])[:6],
            "citation_map": state.get("citation_map", {}),
            "options": [
                {"id": "approve", "label": "Approve claims"},
                {"id": "flag", "label": "Flag claims", "requires_input": True},
            ],
        }
    elif checkpoint_type == "tone_review":
        return {
            "type": "tone_review",
            "outline_preview": state.get("outline", "")[:500],
            "options": [
                {"id": "skip", "label": "Skip tone adjustment"},
                {"id": "adjust", "label": "Adjust tone/focus", "requires_input": True},
            ],
        }
    elif checkpoint_type == "review":
        return {
            "type": "review",
            "outline": state.get("outline", ""),
            "options": [
                {"id": "approve", "label": "Approve outline"},
                {"id": "revise", "label": "Request changes", "requires_input": True},
            ],
        }
    return None


async def run_session_step_by_step(session_id: str, request: StartSessionRequest):
    try:
        # Add delay to allow WebSocket to connect first
        await asyncio.sleep(0.5)

        session = active_sessions[session_id]

        # Build graph
        llm = get_llm(
            model=request.model,
            temperature=request.temperature,
            seed=request.seed,
        )
        graph = build_graph_async(llm)
        session_graphs[session_id] = graph

        # Initial state - DO NOT set feedback to pending, let graph handle it
        state: LectureState = {
            "topic": request.topic,
            "seed": request.seed,
        }

        session["state"] = state
        session["status"] = "running"

        print(f"🚀 Starting session {session_id[:8]}")

        await manager.send_update(
            session_id,
            {
                "type": "status_update",
                "status": "running",
                "current_node": "input",
            },
        )

        # Run the graph with streaming
        config = {
            "recursion_limit": 50,
            "configurable": {"thread_id": session_id},
        }

        # Stream events from the graph with real-time updates
        async for event in graph.astream_events(state, config=config, version="v2"):
            kind = event.get("event")

            # Node execution started
            if kind == "on_chain_start":
                metadata = event.get("metadata", {})
                langgraph_node = metadata.get("langgraph_node")

                if langgraph_node:
                    print(f"🟢 Node STARTING: {langgraph_node}")

                    # Send node_started immediately when execution begins
                    await manager.send_update(
                        session_id,
                        {
                            "type": "node_started",
                            "node": langgraph_node,
                            "status": state.get("status", "running"),
                        },
                    )

            # Node execution completed
            elif kind == "on_chain_end":
                metadata = event.get("metadata", {})
                langgraph_node = metadata.get("langgraph_node")

                if langgraph_node:
                    # Get the output from the node
                    node_output = event.get("data", {}).get("output", {})

                    if node_output and isinstance(node_output, dict):
                        print(
                            f"🔵 Node COMPLETED: {langgraph_node}, output keys: {list(node_output.keys())}"
                        )

                        # Update state with node output
                        state.update(node_output)
                        session["state"] = state

                        current_status = state.get("status", "unknown")
                        waiting = state.get("_waiting_for_human", False)
                        checkpoint_type = state.get("_checkpoint_type")

                        # Send node_complete update
                        update = {
                            "type": "node_complete",
                            "node": langgraph_node,
                            "status": current_status,
                            "waiting_for_human": waiting,
                        }

                        if waiting and checkpoint_type:
                            update["checkpoint_type"] = checkpoint_type
                            update["checkpoint_data"] = get_checkpoint_data(
                                state, checkpoint_type
                            )

                        print(
                            f"📤 Sending node_complete for {langgraph_node}: waiting={waiting}"
                        )
                        await manager.send_update(session_id, update)

                        # If waiting for human, pause execution
                        if waiting:
                            session["waiting_for_human"] = True
                            session["checkpoint_type"] = checkpoint_type
                            print(f"⏸️  Pausing at {checkpoint_type} checkpoint")
                            return  # Exit and wait for feedback

        # Execution complete
        session["status"] = "completed"
        session["completed_at"] = datetime.utcnow().isoformat()
        session["waiting_for_human"] = False

        print(f"✅ Session {session_id[:8]} complete")

        await manager.send_update(
            session_id,
            {
                "type": "session_complete",
                "status": "completed",
            },
        )

    except Exception as e:
        print(f"❌ Error in session {session_id}: {e}")
        import traceback

        traceback.print_exc()

        if session_id in active_sessions:
            active_sessions[session_id]["status"] = "failed"
            active_sessions[session_id]["error"] = str(e)

        await manager.send_update(
            session_id,
            {
                "type": "error",
                "message": str(e),
            },
        )


async def continue_session(session_id: str):
    if session_id not in active_sessions:
        print(f"⚠️  Session {session_id[:8]} not found")
        return

    session = active_sessions[session_id]
    session["waiting_for_human"] = False
    session["checkpoint_type"] = None

    # Get the current state and graph
    state = session.get("state", {})
    if not state:
        print(f"⚠️  No state found for session {session_id[:8]}")
        return

    # Clear the waiting flags so graph continues
    state["_waiting_for_human"] = False
    state["_checkpoint_type"] = None

    print(f"▶️  Continuing session {session_id[:8]} from {state.get('status')}")

    # Reuse the SAME graph instance to avoid restart
    graph = session_graphs.get(session_id)
    if not graph:
        print("⚠️  No graph found, rebuilding...")
        llm = get_llm(
            model=session.get("model"),
            temperature=session.get("temperature", 0.2),
            seed=session.get("seed", 42),
        )
        graph = build_graph_async(llm)
        session_graphs[session_id] = graph

    # Continue execution from current state
    config = {
        "recursion_limit": 50,
        "configurable": {"thread_id": session_id},
    }

    try:
        # Update the checkpoint with the user's feedback
        # This merges the feedback into the saved checkpoint state
        print("📝 Updating checkpoint with feedback")
        graph.update_state(config, state)

        # Now resume from checkpoint by passing None
        # This tells LangGraph to load from checkpoint and continue execution
        print("▶️  Resuming from checkpoint")
        async for event in graph.astream_events(None, config=config, version="v2"):
            kind = event.get("event")

            # Node execution started
            if kind == "on_chain_start":
                metadata = event.get("metadata", {})
                langgraph_node = metadata.get("langgraph_node")

                if langgraph_node:
                    print(f"🟢 Node STARTING: {langgraph_node}")

                    # Send node_started immediately when execution begins
                    await manager.send_update(
                        session_id,
                        {
                            "type": "node_started",
                            "node": langgraph_node,
                            "status": state.get("status", "running"),
                        },
                    )

            # Node execution completed
            elif kind == "on_chain_end":
                metadata = event.get("metadata", {})
                langgraph_node = metadata.get("langgraph_node")

                if langgraph_node:
                    # Get the output from the node
                    node_output = event.get("data", {}).get("output", {})

                    if node_output and isinstance(node_output, dict):
                        print(
                            f"🔵 Node COMPLETED: {langgraph_node}, output keys: {list(node_output.keys())}"
                        )

                        # Update state with node output
                        state.update(node_output)
                        session["state"] = state

                        current_status = state.get("status", "unknown")
                        waiting = state.get("_waiting_for_human", False)
                        checkpoint_type = state.get("_checkpoint_type")

                        # Send node_complete update
                        update = {
                            "type": "node_complete",
                            "node": langgraph_node,
                            "status": current_status,
                            "waiting_for_human": waiting,
                        }

                        if waiting and checkpoint_type:
                            update["checkpoint_type"] = checkpoint_type
                            update["checkpoint_data"] = get_checkpoint_data(
                                state, checkpoint_type
                            )

                        print(
                            f"📤 Sending node_complete for {langgraph_node}: waiting={waiting}"
                        )
                        await manager.send_update(session_id, update)

                        if waiting:
                            session["waiting_for_human"] = True
                            session["checkpoint_type"] = checkpoint_type
                            print(f"⏸️  Pausing at {checkpoint_type} checkpoint")
                            return

        # Complete
        session["status"] = "completed"
        session["completed_at"] = datetime.utcnow().isoformat()

        print(f"✅ Session {session_id[:8]} complete")

        await manager.send_update(
            session_id,
            {
                "type": "session_complete",
                "status": "completed",
            },
        )

    except Exception as e:
        print(f"❌ Error continuing session {session_id}: {e}")
        import traceback

        traceback.print_exc()

        session["status"] = "failed"
        session["error"] = str(e)

        await manager.send_update(
            session_id,
            {
                "type": "error",
                "message": str(e),
            },
        )


@app.get("/")
async def root():
    return {
        "name": "Lecture Assistant API",
        "version": "2.0.0",
        "features": ["websocket", "hitl", "streaming"],
    }


@app.post("/sessions/start", response_model=StartSessionResponse)
async def start_session(request: StartSessionRequest):
    session_id = str(uuid.uuid4())

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

    # Start execution in background
    asyncio.create_task(run_session_step_by_step(session_id, request))

    return StartSessionResponse(
        session_id=session_id,
        status="started",
        message=f"Session started for topic: {request.topic}",
    )


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)

    try:
        # Send current status immediately
        if session_id in active_sessions:
            session = active_sessions[session_id]
            state = session.get("state", {})

            await websocket.send_json(
                {
                    "type": "connected",
                    "session_id": session_id,
                    "status": session.get("status"),
                    "current_node": state.get("status") if state else None,
                    "waiting_for_human": session.get("waiting_for_human", False),
                }
            )

        # Keep connection alive
        while True:
            data = await websocket.receive_text()
            # Echo back (for ping/pong)
            await websocket.send_json({"type": "pong", "data": data})

    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)


@app.get("/sessions/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(session_id: str):
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = active_sessions[session_id]
    state = session.get("state", {})
    current_status = state.get("status") if state else session.get("status")

    waiting_for_human = session.get("waiting_for_human", False)
    checkpoint_type = session.get("checkpoint_type")

    checkpoint_data = None
    if waiting_for_human and checkpoint_type and state:
        checkpoint_data = get_checkpoint_data(state, checkpoint_type)

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
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = active_sessions[session_id]
    state = session.get("state", {})

    if not state:
        raise HTTPException(status_code=400, detail="Session state not available")

    # Update state based on checkpoint
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
            status_code=400, detail=f"Unknown checkpoint: {checkpoint_type}"
        )

    session["state"] = state

    # Continue execution
    asyncio.create_task(continue_session(session_id))

    return {
        "session_id": session_id,
        "checkpoint_type": checkpoint_type,
        "status": "feedback_received",
    }


@app.get("/sessions/{session_id}/result", response_model=SessionResult)
async def get_session_result(session_id: str):
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = active_sessions[session_id]
    state = session.get("state", {})

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


@app.get("/sessions")
async def list_sessions():
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
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    del active_sessions[session_id]
    if session_id in session_graphs:
        del session_graphs[session_id]

    return {"session_id": session_id, "status": "deleted"}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "active_sessions": len(active_sessions),
        "websocket_connections": sum(
            len(conns) for conns in manager.active_connections.values()
        ),
        "environment": {
            "tavily_api_key_set": bool(os.getenv("TAVILY_API_KEY")),
            "openai_api_key_set": bool(os.getenv("OPENAI_API_KEY")),
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
