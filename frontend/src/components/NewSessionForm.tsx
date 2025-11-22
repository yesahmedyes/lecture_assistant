import { useState } from 'react';
import { Rocket, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { sessionApi } from '../api';
import toast from 'react-hot-toast';

interface Props {
  onSessionCreated: (sessionId: string) => void;
}

export default function NewSessionForm({ onSessionCreated }: Props) {
  const [topic, setTopic] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.2);
  const [seed, setSeed] = useState(42);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!topic.trim()) {
      toast.error('Please enter a topic');
      return;
    }

    setIsLoading(true);
    try {
      const response = await sessionApi.startSession({
        topic: topic.trim(),
        model: model || undefined,
        temperature,
        seed,
      });
      
      toast.success('Research session started!');
      onSessionCreated(response.session_id);
      setTopic('');
    } catch (error) {
      console.error('Error starting session:', error);
      toast.error('Failed to start session. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-primary-100 p-2 rounded-lg">
          <Rocket className="w-5 h-5 text-primary-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Start New Research Session</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="topic" className="block text-sm font-medium text-slate-700 mb-2">
            Lecture Topic
          </label>
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Quantum Computing Fundamentals"
            className="input-field"
            disabled={isLoading}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          <Settings className="w-4 h-4" />
          Advanced Settings
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvanced && (
          <div className="bg-slate-50 p-4 rounded-lg space-y-4 border border-slate-200">
            <div>
              <label htmlFor="model" className="block text-sm font-medium text-slate-700 mb-2">
                Model (optional)
              </label>
              <input
                id="model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g., gpt-4"
                className="input-field"
                disabled={isLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="temperature" className="block text-sm font-medium text-slate-700 mb-2">
                  Temperature: {temperature}
                </label>
                <input
                  id="temperature"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="seed" className="block text-sm font-medium text-slate-700 mb-2">
                  Seed
                </label>
                <input
                  id="seed"
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value))}
                  className="input-field"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !topic.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Rocket className="w-4 h-4" />
          {isLoading ? 'Starting Research...' : 'Start Research'}
        </button>
      </form>
    </div>
  );
}

