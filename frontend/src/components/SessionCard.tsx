import { Clock, Eye, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import type { Session } from '../types';

interface Props {
  session: Session;
  onDelete: (sessionId: string) => void;
}

const statusConfig = {
  completed: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Completed' },
  running: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Running', animate: true },
  failed: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Failed' },
  initializing: { icon: Loader2, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Initializing', animate: true },
};

export default function SessionCard({ session, onDelete }: Props) {
  const config = statusConfig[session.status as keyof typeof statusConfig] || statusConfig.running;
  const Icon = config.icon;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.confirm('Are you sure you want to delete this session?')) {
      onDelete(session.session_id);
    }
  };

  return (
    <Link
      to={`/session/${session.session_id}`}
      className="card hover:shadow-md transition-shadow cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-slate-900 group-hover:text-primary-600 transition-colors flex-1">
          {session.topic}
        </h3>
        <button
          onClick={handleDelete}
          className="text-slate-400 hover:text-red-600 transition-colors p-1"
          title="Delete session"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span
          className={`status-badge ${config.bg} ${config.color}`}
        >
          <Icon className={`w-3 h-3 ${config.animate ? 'animate-spin' : ''}`} />
          {config.label}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm text-slate-600">
        <div className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          <span>
            {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
        <button className="btn-secondary flex-1 flex items-center justify-center gap-2">
          <Eye className="w-4 h-4" />
          View Details
        </button>
      </div>
    </Link>
  );
}

