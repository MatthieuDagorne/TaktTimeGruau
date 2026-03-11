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
  const [sites, setSites] = useState([]);
  const [lines, setLines] = useState([]);
  const [screens, setScreens] = useState([]);
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

  // ==================== SITES ====================
  const fetchSites = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/sites`);
      setSites(response.data);
      return response.data;
    } catch (err) {
      console.error('Error fetching sites:', err);
      return [];
    }
  }, []);

  const createSite = useCallback(async (siteData) => {
    const response = await axios.post(`${API}/sites`, siteData);
    setSites(prev => [...prev, response.data]);
    return response.data;
  }, []);

  const updateSite = useCallback(async (siteId, siteData) => {
    const response = await axios.put(`${API}/sites/${siteId}`, siteData);
    setSites(prev => prev.map(s => s.id === siteId ? response.data : s));
    return response.data;
  }, []);

  const deleteSite = useCallback(async (siteId) => {
    await axios.delete(`${API}/sites/${siteId}`);
    setSites(prev => prev.filter(s => s.id !== siteId));
  }, []);

  // ==================== LINES ====================
  const fetchLines = useCallback(async (siteId = null) => {
    setLoading(true);
    setError(null);
    try {
      const url = siteId ? `${API}/lines?site_id=${siteId}` : `${API}/lines`;
      const response = await axios.get(url);
      setLines(response.data);
      return response.data;
    } catch (err) {
      setError(err.message);
      console.error('Error fetching lines:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLine = useCallback(async (lineId) => {
    const response = await axios.get(`${API}/lines/${lineId}`);
    return response.data;
  }, []);

  const createLine = useCallback(async (lineData) => {
    const response = await axios.post(`${API}/lines`, lineData);
    setLines(prev => [...prev, response.data]);
    return response.data;
  }, []);

  const updateLine = useCallback(async (lineId, lineData) => {
    const response = await axios.put(`${API}/lines/${lineId}`, lineData);
    setLines(prev => prev.map(l => l.id === lineId ? response.data : l));
    return response.data;
  }, []);

  const deleteLine = useCallback(async (lineId) => {
    await axios.delete(`${API}/lines/${lineId}`);
    setLines(prev => prev.filter(l => l.id !== lineId));
  }, []);

  // ==================== SCREENS ====================
  const fetchScreens = useCallback(async (lineId = null) => {
    try {
      const url = lineId ? `${API}/screens?line_id=${lineId}` : `${API}/screens`;
      const response = await axios.get(url);
      setScreens(response.data);
      return response.data;
    } catch (err) {
      console.error('Error fetching screens:', err);
      return [];
    }
  }, []);

  const createScreen = useCallback(async (screenData) => {
    const response = await axios.post(`${API}/screens`, screenData);
    setScreens(prev => [...prev, response.data]);
    return response.data;
  }, []);

  const updateScreen = useCallback(async (screenId, screenData) => {
    const response = await axios.put(`${API}/screens/${screenId}`, screenData);
    setScreens(prev => prev.map(s => s.id === screenId ? response.data : s));
    return response.data;
  }, []);

  const deleteScreen = useCallback(async (screenId) => {
    await axios.delete(`${API}/screens/${screenId}`);
    setScreens(prev => prev.filter(s => s.id !== screenId));
  }, []);

  const pingScreen = useCallback(async (screenId) => {
    const response = await axios.post(`${API}/screens/${screenId}/ping`);
    return response.data;
  }, []);

  // ==================== TAKT CONTROLS ====================
  const startTakt = useCallback(async (lineId) => {
    const response = await axios.post(`${API}/lines/${lineId}/start`);
    await fetchLines();
    playSound('takt_start');
    return response.data;
  }, [fetchLines, playSound]);

  const pauseTakt = useCallback(async (lineId) => {
    const response = await axios.post(`${API}/lines/${lineId}/pause`);
    await fetchLines();
    return response.data;
  }, [fetchLines]);

  const stopTakt = useCallback(async (lineId) => {
    const response = await axios.post(`${API}/lines/${lineId}/stop`);
    await fetchLines();
    playSound('takt_end');
    return response.data;
  }, [fetchLines, playSound]);

  const nextTakt = useCallback(async (lineId) => {
    const response = await axios.post(`${API}/lines/${lineId}/next`);
    await fetchLines();
    playSound('takt_start');
    return response.data;
  }, [fetchLines, playSound]);

  const startBreak = useCallback(async (lineId, breakName) => {
    const response = await axios.post(`${API}/lines/${lineId}/break?break_name=${encodeURIComponent(breakName)}`);
    await fetchLines();
    playSound('break_start');
    return response.data;
  }, [fetchLines, playSound]);

  // ==================== EVENTS & STATISTICS ====================
  const fetchEvents = useCallback(async (lineId = null, siteId = null, days = 1) => {
    try {
      let url = `${API}/events?days=${days}`;
      if (lineId) url += `&line_id=${lineId}`;
      if (siteId) url += `&site_id=${siteId}`;
      const response = await axios.get(url);
      return response.data;
    } catch (err) {
      console.error('Error fetching events:', err);
      return [];
    }
  }, []);

  const fetchStatistics = useCallback(async (lineId, days = 1) => {
    try {
      const response = await axios.get(`${API}/statistics/${lineId}?days=${days}`);
      return response.data;
    } catch (err) {
      console.error('Error fetching statistics:', err);
      return null;
    }
  }, []);

  const exportCSV = useCallback((lineId = null, siteId = null, days = 1) => {
    let url = `${API}/export/csv?days=${days}`;
    if (lineId) url += `&line_id=${lineId}`;
    if (siteId) url += `&site_id=${siteId}`;
    window.open(url, '_blank');
  }, []);

  // ==================== WEBSOCKET ====================
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
        if (onUpdate) onUpdate(data);
        if (data.data) {
          setLines(prev => prev.map(l => l.id === lineId ? { ...l, ...data.data } : l));
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    ws.onclose = () => {
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

  useEffect(() => {
    return () => {
      Object.keys(wsConnections.current).forEach(lineId => {
        wsConnections.current[lineId].close();
      });
    };
  }, []);

  const value = {
    sites,
    lines,
    screens,
    loading,
    error,
    // Sites
    fetchSites,
    createSite,
    updateSite,
    deleteSite,
    // Lines
    fetchLines,
    fetchLine,
    createLine,
    updateLine,
    deleteLine,
    // Screens
    fetchScreens,
    createScreen,
    updateScreen,
    deleteScreen,
    pingScreen,
    // Takt controls
    startTakt,
    pauseTakt,
    stopTakt,
    nextTakt,
    startBreak,
    // Events & Stats
    fetchEvents,
    fetchStatistics,
    exportCSV,
    // WebSocket
    connectWebSocket,
    disconnectWebSocket,
    // Audio
    enableAudio,
    playSound,
  };

  return (
    <TaktContext.Provider value={value}>
      {children}
    </TaktContext.Provider>
  );
};
