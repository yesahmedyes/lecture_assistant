import { useState } from 'react';
import { PauseCircle, Send } from 'lucide-react';
import { sessionApi } from '../api';
import type { CheckpointData } from '../types';
import toast from 'react-hot-toast';

interface Props {
  sessionId: string;
  checkpointType: string;
  data: CheckpointData;
  onFeedbackSubmitted: () => void;
}

export default function CheckpointCard({ sessionId, checkpointType, data, onFeedbackSubmitted }: Props) {
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedOption) {
      toast.error('Please select an option');
      return;
    }

    const selectedOpt = data.options.find((o) => o.id === selectedOption);
    if (selectedOpt?.requires_input && !feedbackText.trim()) {
      toast.error('Please provide feedback');
      return;
    }

    setIsSubmitting(true);
    try {
      const decision = selectedOption === 'approve' || selectedOption === 'skip'
        ? 'approve'
        : feedbackText.trim();

      await sessionApi.submitFeedback(sessionId, checkpointType, {
        decision,
      });

      onFeedbackSubmitted();
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error('Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContent = () => {
    switch (data.type) {
      case 'plan_review':
        return (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-slate-900 mb-2">Research Plan</h4>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p className="text-slate-700 whitespace-pre-wrap">{data.plan_summary}</p>
              </div>
            </div>

            {data.queries && data.queries.length > 0 && (
              <div>
                <h4 className="font-medium text-slate-900 mb-2">Search Queries</h4>
                <ul className="space-y-1">
                  {data.queries.map((query, i) => (
                    <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                      <span className="text-primary-600 font-medium">{i + 1}.</span>
                      {query}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

      case 'claims_review':
        return (
          <div className="space-y-4">
            <h4 className="font-medium text-slate-900 mb-2">Extracted Claims</h4>
            <div className="space-y-3">
              {data.claims?.slice(0, 6).map((claim) => (
                <div key={claim.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-slate-900 mb-2">
                    <span className="font-semibold text-primary-600">[{claim.id}]</span> {claim.text}
                  </p>
                  {claim.citations && claim.citations.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {claim.citations.map((cite, i) => (
                        <span key={i} className="status-badge bg-blue-50 text-blue-700 text-xs">
                          {cite}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'tone_review':
        return (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-slate-900 mb-2">Outline Preview</h4>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 max-h-64 overflow-y-auto">
                <p className="text-slate-700 whitespace-pre-wrap text-sm">
                  {data.outline_preview}...
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const selectedOpt = data.options.find((o) => o.id === selectedOption);

  return (
    <div className="card border-2 border-orange-200 bg-orange-50/30">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-orange-100 p-3 rounded-lg">
          <PauseCircle className="w-6 h-6 text-orange-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Checkpoint: {checkpointType.replace('_', ' ')}</h2>
          <p className="text-sm text-slate-600">Human review required to continue</p>
        </div>
      </div>

      {renderContent()}

      <div className="mt-6 pt-6 border-t border-slate-200">
        <h4 className="font-medium text-slate-900 mb-3">What would you like to do?</h4>

        <div className="space-y-3 mb-4">
          {data.options.map((option) => (
            <label
              key={option.id}
              className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                selectedOption === option.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="option"
                value={option.id}
                checked={selectedOption === option.id}
                onChange={(e) => setSelectedOption(e.target.value)}
                className="mt-1 text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1">
                <p className="font-medium text-slate-900">{option.label}</p>
              </div>
            </label>
          ))}
        </div>

        {selectedOpt?.requires_input && (
          <div className="mb-4">
            <label htmlFor="feedback" className="block text-sm font-medium text-slate-700 mb-2">
              {data.type === 'claims_review' ? 'Issues/Notes (e.g., "3 may be outdated")' : 'Your feedback'}
            </label>
            <textarea
              id="feedback"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={4}
              className="input-field resize-none"
              placeholder="Enter your feedback here..."
            />
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !selectedOption}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {isSubmitting ? 'Submitting...' : 'Submit Feedback & Continue'}
        </button>
      </div>
    </div>
  );
}

