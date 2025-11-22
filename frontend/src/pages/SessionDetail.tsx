import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { sessionApi } from "../api";
import { useStore } from "../store";
import { useWebSocket } from "../hooks/useWebSocket";
import PipelineProgress from "../components/PipelineProgress";
import CheckpointCard from "../components/CheckpointCard";
import ResultsView from "../components/ResultsView";

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

  // Clear old session data when sessionId changes
  useEffect(() => {
    console.log("🔄 Session changed, clearing old data");
    setCurrentStatus(null);
    setCurrentResult(null);
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

  // WebSocket message handler
  const handleWebSocketMessage = useCallback(
    async (message: any) => {
      console.log("📨 WebSocket message:", message);

      if (message.type === "connected") {
        console.log("✅ WebSocket connected to session");
      } else if (message.type === "node_started") {
        console.log("🟢 Node started:", message.node);

        // Update current node to show it's now active
        if (!currentStatus) {
          // If no previous status, create a new one
          const newStatus = {
            session_id: sessionId || "",
            status: "running",
            current_node: message.status,
            waiting_for_human: false,
            checkpoint_type: undefined,
            checkpoint_data: undefined,
          };

          setCurrentStatus(newStatus);
        } else {
          const updates = {
            current_node: message.status,
          };

          updateCurrentStatus(updates);
        }
      } else if (message.type === "node_complete") {
        console.log("🔵 Node complete:", message.node);

        // Update checkpoint info if present (don't change current_node, node_started already did that)
        if (!currentStatus) {
          // If no previous status, create a new one
          const newStatus = {
            session_id: sessionId || "",
            status: "running",
            current_node: message.status,
            waiting_for_human: message.waiting_for_human || false,
            checkpoint_type: message.checkpoint_type || null,
            checkpoint_data: message.checkpoint_data || null,
          };
          setCurrentStatus(newStatus);
        } else {
          // Update checkpoint-related fields only
          const updates: any = {
            waiting_for_human:
              message.waiting_for_human ?? currentStatus.waiting_for_human,
            checkpoint_type:
              message.checkpoint_type ?? currentStatus.checkpoint_type,
            checkpoint_data:
              message.checkpoint_data ?? currentStatus.checkpoint_data,
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
    [sessionId, loadStatus]
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
            currentNode={currentStatus?.current_node}
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
            <ResultsView sessionId={sessionId} result={currentResult} />
          ) : (
            // Show loading/processing state
            <div className="card">
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600 mb-4"></div>
                <p className="text-slate-600 font-medium">Processing...</p>
                <p className="text-slate-500 text-sm mt-2">
                  {currentStatus?.current_node
                    ? `Current: ${currentStatus.current_node}`
                    : "Initializing..."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
