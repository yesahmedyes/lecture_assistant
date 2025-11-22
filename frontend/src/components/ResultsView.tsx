import { useState } from 'react';
import { FileText, Database, List, BarChart3, Download, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { SessionResult } from '../types';
import toast from 'react-hot-toast';

interface Props {
  sessionId: string;
  result: SessionResult;
}

type Tab = 'brief' | 'sources' | 'claims' | 'logs';

export default function ResultsView({ sessionId, result }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('brief');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = result.formatted_brief || result.final_brief || '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = result.formatted_brief || result.final_brief || '';
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.topic.replace(/\s+/g, '-')}-brief.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded');
  };

  const tabs = [
    { id: 'brief' as Tab, label: 'Brief', icon: FileText },
    { id: 'sources' as Tab, label: 'Sources', icon: Database, count: result.sources?.length },
    { id: 'claims' as Tab, label: 'Claims', icon: List, count: result.claims?.length },
    { id: 'logs' as Tab, label: 'Logs', icon: BarChart3 },
  ];

  return (
    <div className="card">
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-200 pb-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && (
                <span className="status-badge bg-slate-200 text-slate-700">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === 'brief' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Final Lecture Brief</h3>
            <div className="flex gap-2">
              <button onClick={handleCopy} className="btn-secondary flex items-center gap-2">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={handleDownload} className="btn-primary flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
          <div className="prose prose-slate max-w-none">
            <ReactMarkdown>{result.formatted_brief || result.final_brief || 'No brief available'}</ReactMarkdown>
          </div>
        </div>
      )}

      {activeTab === 'sources' && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Prioritized Sources</h3>
          {result.sources && result.sources.length > 0 ? (
            <div className="space-y-4">
              {result.sources.map((source, i) => (
                <div key={i} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h4 className="font-semibold text-slate-900 mb-2">{source.title}</h4>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 text-sm break-all"
                  >
                    {source.url}
                  </a>
                  <p className="text-slate-600 text-sm mt-2">{source.snippet}</p>
                  {source.query && (
                    <p className="text-slate-500 text-xs mt-2">Query: {source.query}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500">No sources available</p>
          )}
        </div>
      )}

      {activeTab === 'claims' && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Extracted Claims</h3>
          {result.claims && result.claims.length > 0 ? (
            <div className="space-y-3">
              {result.claims.map((claim) => (
                <div key={claim.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-slate-900">
                    <span className="font-semibold text-primary-600">[{claim.id}]</span> {claim.text}
                  </p>
                  {claim.citations && claim.citations.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
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
          ) : (
            <p className="text-slate-500">No claims available</p>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Execution Logs</h3>
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p className="text-slate-600 text-sm">
              Detailed logs will be displayed here. This feature can be enhanced to show the full execution timeline.
            </p>
            <p className="text-slate-500 text-xs mt-2">Session ID: {sessionId}</p>
          </div>
        </div>
      )}
    </div>
  );
}

