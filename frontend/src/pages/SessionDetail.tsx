import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { sessionApi } from "../api";
import { useStore } from "../store";
import { useWebSocket } from "../hooks/useWebSocket";
import PipelineProgress from "../components/PipelineProgress";
import CheckpointCard from "../components/CheckpointCard";
import ResultsView from "../components/ResultsView";
import type { NodeVisit } from "../types";

export default function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const {
    setCurrentStatus,
    updateCurrentStatus,
    setCurrentResult,
    currentStatus,
    currentResult,
  } = useStore();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [nodeVisits, setNodeVisits] = useState<NodeVisit[]>([]);

  // Node name to label mapping
  const nodeLabelMap: Record<string, string> = {
    input: "Input",
    search_plan: "Search Plan",
    plan_draft: "Plan Draft",
    plan_review: "Plan Review",
    web_search: "Web Search",
    extract: "Extract",
    prioritize: "Prioritize",
    claims_extract: "Claims Extract",
    claims_review: "Claims Review",
    claims_refine: "Claims Refine",
    synthesize: "Synthesize",
    review: "Review",
    refine: "Refine",
    tone_review: "Tone Review",
    tone_apply: "Tone Apply",
    generate_brief: "Final Brief",
    format: "Format",
    generate_slides: "Presentation Slides",
  };

  // Checkpoint nodes
  const checkpointNodes = new Set([
    "plan_review",
    "claims_review",
    "review",
    "tone_review",
  ]);

  // Clear old session data when sessionId changes
  useEffect(() => {
    console.log("🔄 Session changed, clearing old data");
    setCurrentStatus(null);
    setCurrentResult(null);
    setNodeVisits([]);
    setIsInitialLoad(true);
  }, [sessionId, setCurrentStatus, setCurrentResult]);

  const loadStatus = useCallback(async () => {
    if (!sessionId) return;

    try {
      const status = await sessionApi.getStatus(sessionId);
      console.log("📡 Loaded status:", status);

      setCurrentStatus(status);

      // If completed, load results
      if (status.status === "completed") {
        const result = await sessionApi.getResult(sessionId);

        setCurrentResult(result);
      }

      setIsInitialLoad(false);
    } catch (error) {
      console.error("Error loading status:", error);
    }
  }, [sessionId, setCurrentStatus, setCurrentResult]);

  // Initial status load - only once on mount
  useEffect(() => {
    if (!sessionId || !isInitialLoad) return;
    console.log("📥 Initial status load");
    loadStatus();
  }, [sessionId, loadStatus, isInitialLoad]);

  // Helper function to create a unique ID for a node visit
  const createNodeVisitId = useCallback(
    (node: string, timestamp: number, currentVisits: NodeVisit[]): string => {
      const visitCount = currentVisits.filter((v) => v.node === node).length;
      return `${timestamp}-${node}-${visitCount}`;
    },
    []
  );

  // Helper function to find the most recent matching node visit
  const findMostRecentNodeVisit = useCallback(
    (node: string, currentVisits: NodeVisit[]): NodeVisit | undefined => {
      const matchingVisits = currentVisits.filter((v) => v.node === node);
      return matchingVisits.sort((a, b) => b.timestamp - a.timestamp)[0];
    },
    []
  );

  // WebSocket message handler
  const handleWebSocketMessage = useCallback(
    async (message: any) => {
      console.log("📨 WebSocket message:", message);

      if (message.type === "connected") {
        console.log("✅ WebSocket connected to session");
      } else if (message.type === "node_started") {
        console.log("🟢 Node started:", message.node);

        const timestamp = Date.now();
        const nodeName = message.node;
        const isCheckpoint = checkpointNodes.has(nodeName);

        // Create new node visit entry (only if not already active or checkpoint)
        setNodeVisits((prev) => {
          // Check if there's already an active visit for this node
          const hasActiveVisit = prev.some(
            (visit) => visit.node === nodeName && visit.status === "active"
          );

          if (hasActiveVisit) {
            return prev; // Don't add a new visit if one is already active
          }

          // For checkpoint nodes, check if there's a checkpoint visit that needs to be reactivated
          if (isCheckpoint) {
            const checkpointVisit = findMostRecentNodeVisit(nodeName, prev);
            if (checkpointVisit && checkpointVisit.status === "checkpoint") {
              // Update the existing checkpoint visit to active instead of creating a new one
              return prev.map((visit) =>
                visit.id === checkpointVisit.id
                  ? {
                      ...visit,
                      status: "active",
                      timestamp, // Update timestamp to show it's processing again
                    }
                  : visit
              );
            }
          }

          // Create new node visit entry
          const newVisit: NodeVisit = {
            id: createNodeVisitId(nodeName, timestamp, prev),
            node: nodeName,
            status: "active",
            timestamp,
            isCheckpoint,
            checkpointType: isCheckpoint ? nodeName : undefined,
          };
          return [...prev, newVisit];
        });

        // Update current status for backward compatibility
        if (!currentStatus) {
          const newStatus = {
            session_id: sessionId || "",
            status: "running",
            current_node: nodeName,
            waiting_for_human: false,
            checkpoint_type: undefined,
            checkpoint_data: undefined,
          };
          setCurrentStatus(newStatus);
        } else {
          updateCurrentStatus({ current_node: nodeName });
        }
      } else if (message.type === "node_complete") {
        console.log("🔵 Node complete:", message.node);

        const nodeName = message.node;
        const isWaitingForHuman = message.waiting_for_human || false;
        const checkpointType = message.checkpoint_type || null;
        const checkpointData = message.checkpoint_data || null;

        // Find and update the most recent matching node visit
        setNodeVisits((prev) => {
          const mostRecent = findMostRecentNodeVisit(nodeName, prev);
          if (!mostRecent) {
            // If somehow we don't have a matching visit, create one
            const timestamp = Date.now();
            return [
              ...prev,
              {
                id: createNodeVisitId(nodeName, timestamp, prev),
                node: nodeName,
                status: isWaitingForHuman ? "checkpoint" : "completed",
                timestamp,
                isCheckpoint: checkpointNodes.has(nodeName),
                checkpointType: checkpointType || undefined,
              },
            ];
          }

          // Update the most recent matching visit
          return prev.map((visit) =>
            visit.id === mostRecent.id
              ? {
                  ...visit,
                  status: isWaitingForHuman ? "checkpoint" : "completed",
                  checkpointType: checkpointType || visit.checkpointType,
                }
              : visit
          );
        });

        // Update current status
        if (!currentStatus) {
          const newStatus = {
            session_id: sessionId || "",
            status: "running",
            current_node: nodeName,
            waiting_for_human: isWaitingForHuman,
            checkpoint_type: checkpointType,
            checkpoint_data: checkpointData,
          };
          setCurrentStatus(newStatus);
        } else {
          const updates: any = {
            waiting_for_human: isWaitingForHuman,
            checkpoint_type: checkpointType,
            checkpoint_data: checkpointData,
          };
          updateCurrentStatus(updates);
        }
      } else if (message.type === "session_complete") {
        console.log("✅ Session complete!");

        // Load final results
        if (sessionId) {
          try {
            const result = await sessionApi.getResult(sessionId);

            setCurrentResult(result);
            if (currentStatus) {
              updateCurrentStatus({ status: "completed" });
            } else {
              setCurrentStatus({
                session_id: sessionId,
                status: "completed",
                current_node: "completed",
                waiting_for_human: false,
                checkpoint_type: undefined,
                checkpoint_data: undefined,
              });
            }
            console.log("🎉 Research complete!");
          } catch (error) {
            console.error("❌ Error loading results:", error);
          }
        }
      } else if (message.type === "error") {
        console.error("❌ WebSocket error:", message.message);
      } else if (message.type === "status_update") {
        console.log(
          "🔄 Status update requested - but ignoring, using WebSocket data"
        );
      }
    },
    [
      sessionId,
      currentStatus,
      setCurrentStatus,
      updateCurrentStatus,
      createNodeVisitId,
      findMostRecentNodeVisit,
      checkpointNodes,
    ]
  );

  // Connect to WebSocket
  useWebSocket(sessionId || null, handleWebSocketMessage);

  const handleRefresh = async () => {
    await loadStatus();

    console.log("🔄 Status updated");
  };

  const handleFeedbackSubmitted = async () => {
    console.log("✅ Feedback submitted. Pipeline continuing...");
  };

  if (!sessionId) {
    return <div>Invalid session ID</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Main
        </button>

        <button
          onClick={handleRefresh}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar - Pipeline Progress */}
        <div className="lg:col-span-1">
          <PipelineProgress
            nodeVisits={nodeVisits}
            nodeLabelMap={nodeLabelMap}
            status={currentStatus?.status}
          />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {currentStatus?.waiting_for_human && currentStatus.checkpoint_data ? (
            // Show checkpoint card when waiting for human input
            <CheckpointCard
              sessionId={sessionId}
              checkpointType={currentStatus.checkpoint_type!}
              data={currentStatus.checkpoint_data}
              onFeedbackSubmitted={handleFeedbackSubmitted}
            />
          ) : currentResult &&
            (currentStatus?.status === "completed" ||
              currentResult.status === "completed") ? (
            // Show results when completed - check both currentStatus and currentResult
            <ResultsView result={currentResult} />
          ) : (
            // Show loading/processing state
            <div className="card">
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600 mb-4"></div>
                <p className="text-slate-600 font-medium">Processing...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
