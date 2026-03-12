import { useState, useEffect, useCallback, useRef } from 'react';

// Helper to get active team's takt duration
const getActiveTeamTaktDuration = (line) => {
  const shiftOrg = line?.shift_organization;
  if (shiftOrg?.teams?.length > 0) {
    const activeTeamId = shiftOrg.active_team_id;
    const activeTeam = activeTeamId 
      ? shiftOrg.teams.find(t => t.id === activeTeamId)
      : shiftOrg.teams[0];
    if (activeTeam?.takt_duration) {
      return activeTeam.takt_duration;
    }
  }
  return line?.takt_duration || 30;
};

export const useTaktTimer = (line, onWarning, onComplete, onAutoNext) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const intervalRef = useRef(null);
  const warningTriggered = useRef(false);
  const completeTriggered = useRef(false);
  const autoNextTriggered = useRef(false);

  // Use active team's takt duration
  const activeTaktDuration = getActiveTeamTaktDuration(line);
  const taktDurationSeconds = activeTaktDuration * 60;
  const state = line?.state || {};
  const status = state.status || 'idle';
  const autoResumeAfterTakt = line?.auto_resume_after_takt ?? true;

  const calculateElapsed = useCallback(() => {
    if (!state.takt_start_time || status === 'idle') {
      return 0;
    }

    // When paused or on break, return the stored elapsed_seconds
    if (status === 'paused' || status === 'break') {
      return state.elapsed_seconds || 0;
    }

    // When running, calculate elapsed from takt_start_time + base elapsed_seconds
    if (status === 'running') {
      const startTime = new Date(state.takt_start_time).getTime();
      const now = Date.now();
      const baseElapsed = state.elapsed_seconds || 0;
      const additionalElapsed = Math.floor((now - startTime) / 1000);
      return baseElapsed + additionalElapsed;
    }

    return state.elapsed_seconds || 0;
  }, [state.takt_start_time, state.elapsed_seconds, status]);

  useEffect(() => {
    // Clear previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Reset triggers when takt changes
    if (state.current_takt !== warningTriggered.current?.takt) {
      warningTriggered.current = { takt: state.current_takt, triggered: false };
      completeTriggered.current = { takt: state.current_takt, triggered: false };
      autoNextTriggered.current = { takt: state.current_takt, triggered: false };
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

      // Auto-advance to next takt if option is enabled
      if (
        status === 'running' &&
        remaining <= 0 &&
        autoResumeAfterTakt &&
        !autoNextTriggered.current?.triggered &&
        onAutoNext
      ) {
        autoNextTriggered.current = { takt: state.current_takt, triggered: true };
        // Small delay to let the completion sound play
        setTimeout(() => {
          onAutoNext();
        }, 1500);
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
  }, [line, status, state.current_takt, state.takt_start_time, state.elapsed_seconds, taktDurationSeconds, calculateElapsed, onWarning, onComplete, onAutoNext, autoResumeAfterTakt]);

  const formatTime = useCallback((totalSeconds) => {
    const isNegative = totalSeconds < 0;
    const absSeconds = Math.abs(totalSeconds);
    const hours = Math.floor(absSeconds / 3600);
    const minutes = Math.floor((absSeconds % 3600) / 60);
    const seconds = absSeconds % 60;

    const prefix = isNegative ? '-' : '';
    if (hours > 0) {
      return `${prefix}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${prefix}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const progressPercentage = taktDurationSeconds > 0 
    ? Math.min(100, (elapsedSeconds / taktDurationSeconds) * 100)
    : 0;

  const isOvertime = elapsedSeconds > taktDurationSeconds && taktDurationSeconds > 0;

  return {
    elapsedSeconds,
    remainingSeconds: isOvertime ? -(elapsedSeconds - taktDurationSeconds) : remainingSeconds,
    elapsedFormatted: formatTime(elapsedSeconds),
    remainingFormatted: formatTime(isOvertime ? -(elapsedSeconds - taktDurationSeconds) : remainingSeconds),
    progressPercentage,
    status,
    currentTakt: state.current_takt || 0,
    estimatedTakts: line?.estimated_takts || 0,
    isOvertime,
    activeTaktDuration,  // Return active team's takt duration
  };
};
