import { create } from "zustand";
import type { Session, SessionStatus, SessionResult } from "./types";

interface AppState {
  sessions: Session[];
  currentSession: Session | null;
  currentStatus: SessionStatus | null;
  currentResult: SessionResult | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (session: Session | null) => void;
  setCurrentStatus: (status: SessionStatus | null) => void;
  updateCurrentStatus: (updates: Partial<SessionStatus>) => void;
  setCurrentResult: (result: SessionResult | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addSession: (session: Session) => void;
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  removeSession: (sessionId: string) => void;
}

export const useStore = create<AppState>((set) => ({
  sessions: [],
  currentSession: null,
  currentStatus: null,
  currentResult: null,
  isLoading: false,
  error: null,

  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (session) => set({ currentSession: session }),
  setCurrentStatus: (status) => set({ currentStatus: status }),
  updateCurrentStatus: (updates) =>
    set((state) => ({
      currentStatus: state.currentStatus
        ? { ...state.currentStatus, ...updates }
        : null,
    })),
  setCurrentResult: (result) => set({ currentResult: result }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  addSession: (session) =>
    set((state) => ({ sessions: [session, ...state.sessions] })),

  updateSession: (sessionId, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.session_id === sessionId ? { ...s, ...updates } : s
      ),
    })),

  removeSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.session_id !== sessionId),
    })),
}));
