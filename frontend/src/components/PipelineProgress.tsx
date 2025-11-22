import { CheckCircle2, Circle, Loader2, Pause } from "lucide-react";
import { useEffect } from "react";

interface Props {
  currentNode?: string;
  status?: string;
}

const nodes = [
  { id: "initializing", label: "Initializing" },
  { id: "input", label: "Input" },
  { id: "search_planning", label: "Search Plan" },
  { id: "plan_drafting", label: "Plan Draft" },
  { id: "plan_review", label: "Plan Review", checkpoint: true },
  { id: "searching", label: "Web Search" },
  { id: "extracting", label: "Extract" },
  { id: "prioritizing", label: "Prioritize" },
  { id: "claims_extracting", label: "Claims Extract" },
  { id: "claims_review", label: "Claims Review", checkpoint: true },
  { id: "synthesizing", label: "Synthesize" },
  { id: "review", label: "Review", checkpoint: true },
  { id: "refining", label: "Refine" },
  { id: "tone_review", label: "Tone Review", checkpoint: true },
  { id: "tone_applying", label: "Tone Apply" },
  { id: "final", label: "Final Brief" },
  { id: "formatting", label: "Format" },
  { id: "completed", label: "Complete" },
];

export default function PipelineProgress({ currentNode, status }: Props) {
  const currentIndex = nodes.findIndex((n) => n.id === currentNode);

  useEffect(() => {
    if (currentIndex === -1 && currentNode) {
      console.warn(
        "⚠️ Node not found in pipeline:",
        currentNode,
        "| Available nodes:",
        nodes.map((n) => n.id)
      );
    }
  }, [currentNode, status, currentIndex]);

  const getNodeStatus = (index: number, node: (typeof nodes)[0]) => {
    // If pipeline is completed, mark all nodes up to and including the last one as completed
    if (status === "completed") {
      return index <= currentIndex ? "completed" : "pending";
    }

    if (currentIndex === -1) return index === 0 ? "active" : "pending";

    if (index < currentIndex) return "completed";

    if (index === currentIndex) {
      if (node.checkpoint) return "checkpoint";
      return "active";
    }
    return "pending";
  };

  return (
    <div className="card sticky top-24">
      <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        {/* <div
          className={`w-2 h-2 rounded-full ${
            status === "completed"
              ? "bg-green-600"
              : "bg-primary-600 animate-pulse"
          }`}
        ></div> */}
        Pipeline Status
      </h3>

      <div className="space-y-2">
        {nodes.map((node, index) => {
          const nodeStatus = getNodeStatus(index, node);

          return (
            <div
              key={node.id}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                nodeStatus === "active" || nodeStatus === "checkpoint"
                  ? "bg-primary-50 border border-primary-200"
                  : ""
              }`}
            >
              {nodeStatus === "completed" ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              ) : nodeStatus === "active" ? (
                <Loader2 className="w-4 h-4 text-primary-600 animate-spin flex-shrink-0" />
              ) : nodeStatus === "checkpoint" ? (
                <Pause className="w-4 h-4 text-orange-600 flex-shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-slate-300 flex-shrink-0" />
              )}

              <span
                className={`text-sm ${
                  nodeStatus === "completed"
                    ? "text-slate-600"
                    : nodeStatus === "active" || nodeStatus === "checkpoint"
                    ? "text-slate-900 font-medium"
                    : "text-slate-400"
                }`}
              >
                {node.label}
              </span>

              {node.checkpoint && nodeStatus === "checkpoint" && (
                <span className="ml-auto status-badge bg-orange-50 text-orange-600">
                  HITL
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* {status === "completed" && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-900">
            ✓ Pipeline Complete
          </p>
        </div>
      )} */}
    </div>
  );
}
