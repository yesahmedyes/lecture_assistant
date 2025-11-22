import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { sessionApi } from '../api';
import { useStore } from '../store';
import PipelineProgress from '../components/PipelineProgress';
import CheckpointCard from '../components/CheckpointCard';
import ResultsView from '../components/ResultsView';
import toast from 'react-hot-toast';

export default function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { setCurrentStatus, setCurrentResult, currentStatus, currentResult } = useStore();
  const [isPolling, setIsPolling] = useState(true);

  useEffect(() => {
    if (!sessionId) return;

    loadStatus();
    const interval = setInterval(loadStatus, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [sessionId]);

  const loadStatus = async () => {
    if (!sessionId) return;

    try {
      const status = await sessionApi.getStatus(sessionId);
      setCurrentStatus(status);

      // If completed, load results
      if (status.status === 'completed') {
        const result = await sessionApi.getResult(sessionId);
        setCurrentResult(result);
        setIsPolling(false);
      }
    } catch (error) {
      console.error('Error loading status:', error);
    }
  };

  const handleRefresh = async () => {
    await loadStatus();
    toast.success('Status updated');
  };

  const handleFeedbackSubmitted = async () => {
    // Wait a bit then refresh status
    setTimeout(loadStatus, 1000);
    toast.success('Feedback submitted. Pipeline continuing...');
  };

  if (!sessionId) {
    return <div>Invalid session ID</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              {currentResult?.topic || 'Session Details'}
            </h1>
            <p className="text-slate-600">Session ID: {sessionId.slice(0, 8)}...</p>
          </div>

          <button
            onClick={handleRefresh}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar - Pipeline Progress */}
        <div className="lg:col-span-1">
          <PipelineProgress currentNode={currentStatus?.current_node} status={currentStatus?.status} />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {currentStatus?.waiting_for_human && currentStatus.checkpoint_data ? (
            <CheckpointCard
              sessionId={sessionId}
              checkpointType={currentStatus.checkpoint_type!}
              data={currentStatus.checkpoint_data}
              onFeedbackSubmitted={handleFeedbackSubmitted}
            />
          ) : currentStatus?.status === 'completed' && currentResult ? (
            <ResultsView sessionId={sessionId} result={currentResult} />
          ) : (
            <div className="card">
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600 mb-4"></div>
                <p className="text-slate-600 font-medium">Processing...</p>
                <p className="text-slate-500 text-sm mt-2">
                  {currentStatus?.current_node ? `Current: ${currentStatus.current_node}` : 'Initializing...'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

