import { CheckCircle2, Circle, Loader2, Pause } from "lucide-react";
import type { NodeVisit } from "../types";

interface Props {
  nodeVisits: NodeVisit[];
  nodeLabelMap: Record<string, string>;
  status?: string;
}

export default function PipelineProgress({
  nodeVisits,
  nodeLabelMap,
  status,
}: Props) {
  const getNodeLabel = (node: string): string => {
    return nodeLabelMap[node] || node;
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
        {nodeVisits.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            Waiting for pipeline to start...
          </div>
        ) : (
          nodeVisits.map((visit) => {
            const isActive = visit.status === "active";
            const isCompleted = visit.status === "completed";
            const isCheckpoint = visit.status === "checkpoint";

            return (
              <div
                key={visit.id}
                className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                  isActive || isCheckpoint
                    ? "bg-primary-50 border border-primary-200"
                    : ""
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 text-primary-600 animate-spin flex-shrink-0" />
                ) : isCheckpoint ? (
                  <Pause className="w-4 h-4 text-orange-600 flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-300 flex-shrink-0" />
                )}

                <span
                  className={`text-sm ${
                    isCompleted
                      ? "text-slate-600"
                      : isActive || isCheckpoint
                      ? "text-slate-900 font-medium"
                      : "text-slate-400"
                  }`}
                >
                  {getNodeLabel(visit.node)}
                </span>

                {visit.isCheckpoint && isCheckpoint && (
                  <span className="ml-auto status-badge bg-orange-50 text-orange-600">
                    HITL
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
