import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

const TaktContext = createContext(null);

export const useTakt = () => {
  const context = useContext(TaktContext);
  if (!context) {
    throw new Error('useTakt must be used within TaktProvider');
  }
  return context;
};

export const TaktProvider = ({ children }) => {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const wsConnections = useRef({});
  const audioContext = useRef(null);
  const audioEnabled = useRef(false);

  // Initialize audio context on user interaction
  const enableAudio = useCallback(() => {
    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }
    audioEnabled.current = true;
  }, []);

  // Play sound alert
  const playSound = useCallback((type) => {
    if (!audioEnabled.current || !audioContext.current) return;
    
    const ctx = audioContext.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Different sounds for different events
    switch (type) {
      case 'takt_start':
        oscillator.frequency.value = 880;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);
        break;
      case 'takt_warning':
        oscillator.frequency.value = 660;
        oscillator.type = 'triangle';
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
        // Double beep
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.frequency.value = 660;
          osc2.type = 'triangle';
          gain2.gain.setValueAtTime(0.3, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc2.start(ctx.currentTime);
          osc2.stop(ctx.currentTime + 0.3);
        }, 400);
        break;
      case 'takt_end':
        oscillator.frequency.value = 440;
        oscillator.type = 'square';
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 1);
        break;
      case 'break_start':
        oscillator.frequency.value = 523;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.8);
        break;
      case 'break_end':
        oscillator.frequency.value = 784;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);
        break;
      default:
        oscillator.frequency.value = 600;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
    }
  }, []);

  // Fetch all lines
  const fetchLines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API}/lines`);
      setLines(response.data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching lines:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch single line
  const fetchLine = useCallback(async (lineId) => {
    try {
      const response = await axios.get(`${API}/lines/${lineId}`);
      return response.data;
    } catch (err) {
      console.error('Error fetching line:', err);
      throw err;
    }
  }, []);

  // Create line
  const createLine = useCallback(async (lineData) => {
    try {
      const response = await axios.post(`${API}/lines`, lineData);
      setLines(prev => [...prev, response.data]);
      return response.data;
    } catch (err) {
      console.error('Error creating line:', err);
      throw err;
    }
  }, []);

  // Update line
  const updateLine = useCallback(async (lineId, lineData) => {
    try {
      const response = await axios.put(`${API}/lines/${lineId}`, lineData);
      setLines(prev => prev.map(l => l.id === lineId ? response.data : l));
      return response.data;
    } catch (err) {
      console.error('Error updating line:', err);
      throw err;
    }
  }, []);

  // Delete line
  const deleteLine = useCallback(async (lineId) => {
    try {
      await axios.delete(`${API}/lines/${lineId}`);
      setLines(prev => prev.filter(l => l.id !== lineId));
    } catch (err) {
      console.error('Error deleting line:', err);
      throw err;
    }
  }, []);

  // Takt controls
  const startTakt = useCallback(async (lineId) => {
    try {
      const response = await axios.post(`${API}/lines/${lineId}/start`);
      await fetchLines();
      playSound('takt_start');
      return response.data;
    } catch (err) {
      console.error('Error starting takt:', err);
      throw err;
    }
  }, [fetchLines, playSound]);

  const pauseTakt = useCallback(async (lineId) => {
    try {
      const response = await axios.post(`${API}/lines/${lineId}/pause`);
      await fetchLines();
      return response.data;
    } catch (err) {
      console.error('Error pausing takt:', err);
      throw err;
    }
  }, [fetchLines]);

  const stopTakt = useCallback(async (lineId) => {
    try {
      const response = await axios.post(`${API}/lines/${lineId}/stop`);
      await fetchLines();
      playSound('takt_end');
      return response.data;
    } catch (err) {
      console.error('Error stopping takt:', err);
      throw err;
    }
  }, [fetchLines, playSound]);

  const nextTakt = useCallback(async (lineId) => {
    try {
      const response = await axios.post(`${API}/lines/${lineId}/next`);
      await fetchLines();
      playSound('takt_start');
      return response.data;
    } catch (err) {
      console.error('Error advancing takt:', err);
      throw err;
    }
  }, [fetchLines, playSound]);

  const startBreak = useCallback(async (lineId, breakName) => {
    try {
      const response = await axios.post(`${API}/lines/${lineId}/break?break_name=${encodeURIComponent(breakName)}`);
      await fetchLines();
      playSound('break_start');
      return response.data;
    } catch (err) {
      console.error('Error starting break:', err);
      throw err;
    }
  }, [fetchLines, playSound]);

  // WebSocket connection for real-time updates
  const connectWebSocket = useCallback((lineId, onUpdate) => {
    if (wsConnections.current[lineId]) {
      return wsConnections.current[lineId];
    }

    const ws = new WebSocket(`${WS_URL}/api/ws/${lineId}`);
    
    ws.onopen = () => {
      console.log(`WebSocket connected for line ${lineId}`);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onUpdate) {
          onUpdate(data);
        }
        // Update lines state
        if (data.data) {
          setLines(prev => prev.map(l => l.id === lineId ? { ...l, ...data.data } : l));
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    ws.onclose = () => {
      console.log(`WebSocket disconnected for line ${lineId}`);
      delete wsConnections.current[lineId];
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    wsConnections.current[lineId] = ws;
    return ws;
  }, []);

  const disconnectWebSocket = useCallback((lineId) => {
    if (wsConnections.current[lineId]) {
      wsConnections.current[lineId].close();
      delete wsConnections.current[lineId];
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.keys(wsConnections.current).forEach(lineId => {
        wsConnections.current[lineId].close();
      });
    };
  }, []);

  const value = {
    lines,
    loading,
    error,
    fetchLines,
    fetchLine,
    createLine,
    updateLine,
    deleteLine,
    startTakt,
    pauseTakt,
    stopTakt,
    nextTakt,
    startBreak,
    connectWebSocket,
    disconnectWebSocket,
    enableAudio,
    playSound,
  };

  return (
    <TaktContext.Provider value={value}>
      {children}
    </TaktContext.Provider>
  );
};
