import { useState, useEffect, useCallback, useRef } from 'react';

// Helper to get active team
const getActiveTeam = (line) => {
  const shiftOrg = line?.shift_organization;
  if (!shiftOrg?.teams?.length) return null;
  
  const teams = shiftOrg.teams;
  
  // First priority: manually set active_team_id
  const activeTeamId = shiftOrg.active_team_id;
  if (activeTeamId) {
    const team = teams.find(t => t.id === activeTeamId);
    if (team) return team;
  }
  
  // Fallback to first team
  return teams[0];
};

// Helper to get active team's takt duration
const getActiveTeamTaktDuration = (line) => {
  const activeTeam = getActiveTeam(line);
  if (activeTeam?.takt_duration) {
    return activeTeam.takt_duration;
  }
  return line?.takt_duration || 30;
};

// Helper to convert time string (HH:MM) to minutes since midnight
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Helper to get current time in Paris timezone as HH:MM
const getCurrentParisTime = () => {
  const now = new Date();
  return now.toLocaleTimeString('fr-FR', { 
    timeZone: 'Europe/Paris', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
};

// Check if current time is past day end
const isPastDayEnd = (dayEnd) => {
  if (!dayEnd) return false;
  const currentTime = getCurrentParisTime();
  const currentMinutes = timeToMinutes(currentTime);
  const dayEndMinutes = timeToMinutes(dayEnd);
  
  // Simple check - assumes no overnight shifts for day end detection
  return currentMinutes >= dayEndMinutes;
};

export const useTaktTimer = (line, onWarning, onComplete, onAutoNext, onBreakStart, onDayEnd, onAutoResumeAfterBreak) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [breakRemainingSeconds, setBreakRemainingSeconds] = useState(0);
  const [stopTimeSeconds, setStopTimeSeconds] = useState(0);
  const [pendingBreak, setPendingBreak] = useState(null);
  const intervalRef = useRef(null);
  const warningTriggeredForTakt = useRef(null);
  const completeTriggeredForTakt = useRef(null);
  const autoNextTriggeredForTakt = useRef(null);
  const dayEndTriggeredRef = useRef(false);
  const breakTriggeredRef = useRef({});
  const breakAutoResumeTriggeredRef = useRef(false);

  // Use active team's takt duration
  const activeTaktDuration = getActiveTeamTaktDuration(line);
  const taktDurationSeconds = activeTaktDuration * 60;
  const state = line?.state || {};
  const status = state.status || 'idle';
  const currentTakt = state.current_takt || 0;
  const autoResumeAfterTakt = line?.auto_resume_after_takt ?? true;
  const autoResumeAfterBreak = line?.auto_resume_after_break ?? true;

  // Get active team's day end time
  const activeTeam = getActiveTeam(line);
  const dayEnd = activeTeam?.day_end || '17:00';

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

  // Calculate break remaining time
  const calculateBreakRemaining = useCallback(() => {
    if (status !== 'break' || !state.break_end_time) {
      return 0;
    }
    const endTime = new Date(state.break_end_time).getTime();
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
    return remaining;
  }, [status, state.break_end_time]);

  // Calculate stop time (time since paused)
  const calculateStopTime = useCallback(() => {
    if (status !== 'paused' && status !== 'idle') {
      return 0;
    }
    
    // Use paused_at timestamp if available
    if (state.paused_at) {
      const pausedTime = new Date(state.paused_at).getTime();
      const now = Date.now();
      const stopTime = Math.floor((now - pausedTime) / 1000);
      return stopTime;
    }
    
    return 0;
  }, [status, state.paused_at]);

  // Check for scheduled breaks
  const checkScheduledBreaks = useCallback(() => {
    if (status !== 'running' || !line) return null;
    
    if (!activeTeam?.breaks?.length) return null;
    
    const currentTime = getCurrentParisTime();
    const currentMinutes = timeToMinutes(currentTime);
    
    for (const brk of activeTeam.breaks) {
      if (!brk.start_time || !brk.duration) continue;
      
      const breakStartMinutes = timeToMinutes(brk.start_time);
      const breakKey = `${brk.name}_${brk.start_time}`;
      
      // Check if this break was already triggered today
      if (breakTriggeredRef.current[breakKey]) continue;
      
      const triggerMode = brk.trigger_mode || 'immediate';
      
      if (triggerMode === 'immediate') {
        // Trigger exactly at break time (within 1 minute window)
        if (currentMinutes >= breakStartMinutes && currentMinutes < breakStartMinutes + 1) {
          breakTriggeredRef.current[breakKey] = true;
          return { ...brk, triggerNow: true };
        }
      } else if (triggerMode === 'end_of_takt') {
        // Mark as pending when time is reached, trigger at end of takt
        if (currentMinutes >= breakStartMinutes && currentMinutes < breakStartMinutes + 1) {
          breakTriggeredRef.current[breakKey] = true;
          return { ...brk, triggerNow: false, pendingUntilTaktEnd: true };
        }
      }
    }
    
    return null;
  }, [status, line, activeTeam]);

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

  // Reset day end trigger when status changes to idle
  useEffect(() => {
    if (status === 'idle') {
      dayEndTriggeredRef.current = false;
    }
  }, [status]);

  // Reset break auto-resume trigger when status changes from break
  useEffect(() => {
    if (status !== 'break') {
      breakAutoResumeTriggeredRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    // Clear previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const updateTimer = () => {
      const elapsed = calculateElapsed();
      const remaining = Math.max(0, taktDurationSeconds - elapsed);
      const breakRemaining = calculateBreakRemaining();
      const stopTime = calculateStopTime();
      
      setElapsedSeconds(elapsed);
      setRemainingSeconds(remaining);
      setBreakRemainingSeconds(breakRemaining);
      setStopTimeSeconds(stopTime);

      // Check for end of day - only when running or paused
      if ((status === 'running' || status === 'paused' || status === 'break') && !dayEndTriggeredRef.current) {
        if (isPastDayEnd(dayEnd)) {
          dayEndTriggeredRef.current = true;
          console.log('[TIMER] End of day detected, calling onDayEnd');
          if (onDayEnd) {
            onDayEnd(elapsed);
          }
          return; // Stop processing after day end
        }
      }

      // Check for auto-resume after break ends
      if (status === 'break' && breakRemaining <= 0 && !breakAutoResumeTriggeredRef.current) {
        breakAutoResumeTriggeredRef.current = true;
        console.log('[TIMER] Break ended, autoResumeAfterBreak:', autoResumeAfterBreak);
        if (autoResumeAfterBreak && onAutoResumeAfterBreak) {
          console.log('[TIMER] Triggering auto-resume after break');
          setTimeout(() => {
            onAutoResumeAfterBreak();
          }, 1000);
        }
        return;
      }

      // Check for break warning (X minutes before break end)
      if (status === 'break') {
        const minutesBeforeBreakEnd = line?.sound_alerts?.minutes_before_break_end || 0;
        const breakWarningSeconds = minutesBeforeBreakEnd * 60;
        
        // Trigger sound when exactly X minutes remain (with 1 second tolerance)
        if (minutesBeforeBreakEnd > 0 && 
            breakRemaining <= breakWarningSeconds && 
            breakRemaining > (breakWarningSeconds - 2)) {
          const breakWarningKey = `${state.current_break_name}_${breakWarningSeconds}`;
          if (!breakTriggeredRef.current[breakWarningKey]) {
            breakTriggeredRef.current[breakWarningKey] = true;
            console.log(`[TIMER] Break warning: ${minutesBeforeBreakEnd} min before end`);
            // Import and use playSound from context
            if (typeof window !== 'undefined' && window.soundManager) {
              window.soundManager.play('break_warning');
            }
          }
        }
        return; // Don't process other alerts during break
      }

      // Only process other alerts when running
      if (status !== 'running') return;

      // Check for scheduled breaks
      const scheduledBreak = checkScheduledBreaks();
      if (scheduledBreak) {
        if (scheduledBreak.triggerNow) {
          if (onBreakStart) {
            onBreakStart(scheduledBreak.name, scheduledBreak.duration);
          }
        } else if (scheduledBreak.pendingUntilTaktEnd) {
          setPendingBreak(scheduledBreak);
        }
      }

      // Get warning threshold from settings (in seconds)
      const warningMinutes = line?.sound_alerts?.minutes_before_takt_end ?? 5;
      const warningThreshold = warningMinutes * 60;

      // Check for warning (X minutes before end)
      // Use a 10-second window to ensure we catch the threshold even with polling delays
      if (
        remaining <= warningThreshold &&
        remaining > warningThreshold - 10 &&  // Within 10 seconds of threshold
        warningTriggeredForTakt.current !== currentTakt &&
        onWarning
      ) {
        console.log(`[ALERT] Warning triggered for takt ${currentTakt}, remaining: ${remaining}s, threshold: ${warningThreshold}s`);
        warningTriggeredForTakt.current = currentTakt;
        onWarning();
      }

      // Check for completion (takt end)
      if (
        remaining <= 0 &&
        completeTriggeredForTakt.current !== currentTakt &&
        onComplete
      ) {
        console.log(`[ALERT] Complete triggered for takt ${currentTakt}`);
        completeTriggeredForTakt.current = currentTakt;
        onComplete();
      }

      // Handle end of takt - check for pending break or auto-advance
      if (remaining <= 0 && autoNextTriggeredForTakt.current !== currentTakt) {
        // If there's a pending break (end_of_takt mode), trigger it
        if (pendingBreak) {
          autoNextTriggeredForTakt.current = currentTakt;
          const breakToStart = pendingBreak;
          setPendingBreak(null);
          if (onBreakStart) {
            setTimeout(() => {
              onBreakStart(breakToStart.name, breakToStart.duration);
            }, 1500);
          }
        }
        // Otherwise, auto-advance to next takt if option is enabled
        else if (autoResumeAfterTakt && onAutoNext) {
          autoNextTriggeredForTakt.current = currentTakt;
          setTimeout(() => {
            onAutoNext();
          }, 1500);
        }
      }
    };

    // Initial update
    updateTimer();

    // Set interval for both running and break status
    if (status === 'running' || status === 'break' || status === 'paused') {
      intervalRef.current = setInterval(updateTimer, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [line, status, currentTakt, state.takt_start_time, state.elapsed_seconds, state.break_end_time, state.paused_at, taktDurationSeconds, dayEnd, calculateElapsed, calculateBreakRemaining, calculateStopTime, checkScheduledBreaks, onWarning, onComplete, onAutoNext, onBreakStart, onDayEnd, onAutoResumeAfterBreak, autoResumeAfterTakt, autoResumeAfterBreak, pendingBreak]);

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
    currentTakt,
    estimatedTakts: line?.estimated_takts || 0,
    isOvertime,
    activeTaktDuration,
    // Break-related data
    breakRemainingSeconds,
    breakRemainingFormatted: formatTime(breakRemainingSeconds),
    currentBreakName: state.current_break_name || null,
    breakDurationMinutes: state.break_duration_minutes || 0,
    pendingBreak,
    // Stop time data
    stopTimeSeconds,
    stopTimeFormatted: formatTime(stopTimeSeconds),
  };
};
