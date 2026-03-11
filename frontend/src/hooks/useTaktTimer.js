import { useState, useEffect, useCallback, useRef } from 'react';

export const useTaktTimer = (line, onWarning, onComplete) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const intervalRef = useRef(null);
  const warningTriggered = useRef(false);
  const completeTriggered = useRef(false);

  const taktDurationSeconds = line?.takt_duration ? line.takt_duration * 60 : 0;
  const state = line?.state || {};
  const status = state.status || 'idle';

  const calculateElapsed = useCallback(() => {
    if (!state.takt_start_time || status === 'idle') {
      return state.elapsed_seconds || 0;
    }

    if (status === 'paused' || status === 'break') {
      return state.elapsed_seconds || 0;
    }

    if (status === 'running') {
      const startTime = new Date(state.takt_start_time).getTime();
      const now = Date.now();
      const baseElapsed = state.elapsed_seconds || 0;
      const additionalElapsed = Math.floor((now - startTime) / 1000);
      return baseElapsed + additionalElapsed;
    }

    return state.elapsed_seconds || 0;
  }, [state, status]);

  useEffect(() => {
    // Clear previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Reset triggers when takt changes
    if (state.current_takt !== warningTriggered.current?.takt) {
      warningTriggered.current = { takt: state.current_takt, triggered: false };
      completeTriggered.current = { takt: state.current_takt, triggered: false };
    }

    const updateTimer = () => {
      const elapsed = calculateElapsed();
      const remaining = Math.max(0, taktDurationSeconds - elapsed);
      
      setElapsedSeconds(elapsed);
      setRemainingSeconds(remaining);

      // Check for warning (x minutes before end)
      const warningThreshold = (line?.sound_alerts?.minutes_before_takt_end || 5) * 60;
      if (
        status === 'running' &&
        remaining <= warningThreshold &&
        remaining > 0 &&
        !warningTriggered.current?.triggered &&
        onWarning
      ) {
        warningTriggered.current = { takt: state.current_takt, triggered: true };
        onWarning();
      }

      // Check for completion
      if (
        status === 'running' &&
        remaining <= 0 &&
        !completeTriggered.current?.triggered &&
        onComplete
      ) {
        completeTriggered.current = { takt: state.current_takt, triggered: true };
        onComplete();
      }
    };

    // Initial update
    updateTimer();

    // Set interval only if running
    if (status === 'running') {
      intervalRef.current = setInterval(updateTimer, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [line, status, state, taktDurationSeconds, calculateElapsed, onWarning, onComplete]);

  const formatTime = useCallback((totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const progressPercentage = taktDurationSeconds > 0 
    ? Math.min(100, (elapsedSeconds / taktDurationSeconds) * 100)
    : 0;

  return {
    elapsedSeconds,
    remainingSeconds,
    elapsedFormatted: formatTime(elapsedSeconds),
    remainingFormatted: formatTime(remainingSeconds),
    progressPercentage,
    status,
    currentTakt: state.current_takt || 0,
    estimatedTakts: line?.estimated_takts || 0,
    isOvertime: elapsedSeconds > taktDurationSeconds,
  };
};
