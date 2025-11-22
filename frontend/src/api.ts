import axios from 'axios';
import type {
  Session,
  SessionStatus,
  SessionResult,
  LogsResponse,
  StartSessionRequest,
  HumanFeedbackRequest,
} from './types';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const sessionApi = {
  // Start a new session
  startSession: async (request: StartSessionRequest) => {
    const response = await api.post<{ session_id: string; status: string; message: string }>(
      '/sessions/start',
      request
    );
    return response.data;
  },

  // Get session status
  getStatus: async (sessionId: string) => {
    const response = await api.get<SessionStatus>(`/sessions/${sessionId}/status`);
    return response.data;
  },

  // Submit human feedback
  submitFeedback: async (
    sessionId: string,
    checkpointType: string,
    feedback: HumanFeedbackRequest
  ) => {
    const response = await api.post(
      `/sessions/${sessionId}/feedback`,
      feedback,
      {
        params: { checkpoint_type: checkpointType },
      }
    );
    return response.data;
  },

  // Get session result
  getResult: async (sessionId: string) => {
    const response = await api.get<SessionResult>(`/sessions/${sessionId}/result`);
    return response.data;
  },

  // Get session logs
  getLogs: async (sessionId: string) => {
    const response = await api.get<LogsResponse>(`/sessions/${sessionId}/logs`);
    return response.data;
  },

  // List all sessions
  listSessions: async () => {
    const response = await api.get<{ sessions: Session[]; total: number }>('/sessions');
    return response.data;
  },

  // Delete a session
  deleteSession: async (sessionId: string) => {
    const response = await api.delete(`/sessions/${sessionId}`);
    return response.data;
  },

  // Health check
  healthCheck: async () => {
    const response = await api.get('/health');
    return response.data;
  },
};

export default api;

