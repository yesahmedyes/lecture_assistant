import { useEffect, useRef, useState } from "react";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export function useWebSocket(
  sessionId: string | null,
  onMessage: (message: WebSocketMessage) => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isConnectingRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    const connect = () => {
      // Prevent duplicate connections
      if (
        isConnectingRef.current ||
        wsRef.current?.readyState === WebSocket.OPEN
      ) {
        console.log("⚠️ Connection already exists, skipping");
        return;
      }

      isConnectingRef.current = true;

      // Determine WebSocket URL
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname;
      // @ts-ignore - Vite provides import.meta.env
      const port = import.meta.env.DEV ? "8000" : window.location.port;
      const wsUrl = `${protocol}//${host}:${port}/ws/${sessionId}`;

      console.log("Connecting to WebSocket:", wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        isConnectingRef.current = false;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          onMessage(message);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        isConnectingRef.current = false;
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);
        wsRef.current = null;
        isConnectingRef.current = false;

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("Attempting to reconnect...");
          connect();
        }, 3000);
      };
    };

    connect();

    // Cleanup
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        // Close without triggering reconnect
        const ws = wsRef.current;
        ws.onclose = null; // Remove handler to prevent reconnect
        ws.close();
        wsRef.current = null;
      }
      isConnectingRef.current = false;
    };
  }, [sessionId]);

  // Send ping every 30 seconds to keep connection alive
  useEffect(() => {
    if (!isConnected || !wsRef.current) return;

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 30000);

    return () => clearInterval(pingInterval);
  }, [isConnected]);

  return { isConnected };
}
