import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTakt } from '@/context/TaktContext';
import { useTaktTimer } from '@/hooks/useTaktTimer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Factory,
  Clock,
  Timer,
  Coffee,
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipForward,
  Square,
} from 'lucide-react';

const StatusBadge = ({ status }) => {
  const statusConfig = {
    idle: { label: 'EN ATTENTE', className: 'bg-slate-600/30 text-slate-300 border-slate-500', icon: Clock },
    running: { label: 'EN COURS', className: 'bg-green-500/30 text-green-400 border-green-500', icon: Play },
    paused: { label: 'SUSPENDU', className: 'bg-yellow-500/30 text-yellow-400 border-yellow-500', icon: Pause },
    break: { label: 'PAUSE', className: 'bg-yellow-500/30 text-yellow-400 border-yellow-500', icon: Coffee },
    finished: { label: 'TERMINÉ', className: 'bg-red-500/30 text-red-400 border-red-500', icon: Square },
  };

  const config = statusConfig[status] || statusConfig.idle;
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={`${config.className} font-bold uppercase tracking-widest text-xl md:text-2xl px-6 py-3 border-2`}
      data-testid="tv-status-badge"
    >
      <Icon className="h-6 w-6 mr-3" />
      {config.label}
    </Badge>
  );
};

export default function TVDisplay() {
  const { lineId } = useParams();
  const { fetchLine, connectWebSocket, disconnectWebSocket, enableAudio, playSound, startTakt, pauseTakt, nextTakt, checkAutoStart, autoStartTakt, startBreak, endDay } = useTakt();
  const [line, setLine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [autoStartChecked, setAutoStartChecked] = useState(false);
  const controlsTimeout = useRef(null);

  // Check if auto-start is enabled
  const autoStartEnabled = line?.auto_start_at_day_begin ?? false;

  const handleWarning = useCallback(() => {
    // Play warning sound if audio is enabled and warning minutes is configured
    if (audioEnabled && line?.sound_alerts?.minutes_before_takt_end > 0) {
      console.log('[TVDisplay] Playing takt warning sound');
      playSound('takt_warning');
    }
  }, [audioEnabled, line, playSound]);

  const handleComplete = useCallback(() => {
    // Play end sound if audio is enabled and takt_end is true
    if (audioEnabled && line?.sound_alerts?.takt_end) {
      console.log('[TVDisplay] Playing takt end sound');
      playSound('takt_end');
    }
  }, [audioEnabled, line, playSound]);

  const handleAutoNext = useCallback(async () => {
    if (line?.auto_resume_after_takt) {
      try {
        await nextTakt(lineId);
        await loadLine();
      } catch (err) {
        console.error('Auto-next failed:', err);
      }
    }
  }, [line, lineId, nextTakt]);

  const handleBreakStart = useCallback(async (breakName, breakDuration) => {
    try {
      enableAudio();
      setAudioEnabled(true);
      await startBreak(lineId, breakName, breakDuration);
      await loadLine();
    } catch (err) {
      console.error('Break start failed:', err);
    }
  }, [lineId, startBreak, enableAudio]);

  const handleDayEnd = useCallback(async (elapsedSeconds) => {
    try {
      console.log('[TVDisplay] Day end triggered, saving carryover');
      await endDay(lineId);
      await loadLine();
    } catch (err) {
      console.error('Day end failed:', err);
    }
  }, [lineId, endDay]);

  const { 
    elapsedFormatted, 
    remainingFormatted, 
    progressPercentage,
    status,
    currentTakt,
    estimatedTakts,
    isOvertime,
    activeTaktDuration,
    breakRemainingFormatted,
    breakRemainingSeconds,
    currentBreakName,
    breakDurationMinutes,
  } = useTaktTimer(line, handleWarning, handleComplete, handleAutoNext, handleBreakStart, handleDayEnd);

  // Don't show overtime if auto-next is enabled
  const showOvertime = isOvertime && !line?.auto_resume_after_takt;
  
  // Show next takt button only when overtime AND auto-next is disabled
  const showNextTaktButton = showOvertime;

  // Get the active team's schedule for display
  const getActiveTeamSchedule = () => {
    const shiftOrg = line?.shift_organization;
    if (shiftOrg?.teams?.length > 0) {
      const activeTeamId = shiftOrg.active_team_id;
      const activeTeam = activeTeamId 
        ? shiftOrg.teams.find(t => t.id === activeTeamId)
        : shiftOrg.teams[0];
      if (activeTeam) {
        return {
          start: activeTeam.day_start || '08:00',
          end: activeTeam.day_end || '17:00'
        };
      }
    }
    return { start: '08:00', end: '17:00' };
  };

  const schedule = getActiveTeamSchedule();

  useEffect(() => {
    loadLine();
    
    // Connect to WebSocket for real-time updates
    const ws = connectWebSocket(lineId, (data) => {
      if (data.type === 'state_update' || data.type === 'config_update' || data.type === 'initial') {
        setLine(prev => ({ ...prev, ...data.data }));
      }
    });

    // Refresh line data periodically as backup
    const interval = setInterval(loadLine, 10000);

    return () => {
      clearInterval(interval);
      disconnectWebSocket(lineId);
    };
  }, [lineId]);

  // Auto-start check when line is loaded
  useEffect(() => {
    const checkAndAutoStart = async () => {
      if (line && autoStartEnabled && !autoStartChecked && line?.state?.status === 'idle') {
        setAutoStartChecked(true);
        const result = await checkAutoStart(lineId);
        if (result.should_auto_start) {
          await autoStartTakt(lineId);
          await loadLine();
        }
      }
    };
    checkAndAutoStart();
  }, [line, autoStartEnabled, autoStartChecked, lineId, checkAutoStart, autoStartTakt]);

  const loadLine = async () => {
    try {
      const data = await fetchLine(lineId);
      setLine(data);
    } catch (err) {
      console.error('Error loading line:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableAudio = () => {
    enableAudio();
    setAudioEnabled(true);
    playSound('takt_start');
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    controlsTimeout.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const handleStart = async () => {
    enableAudio();
    setAudioEnabled(true);
    await startTakt(lineId);
    await loadLine();
  };

  const handlePause = async () => {
    await pauseTakt(lineId);
    await loadLine();
  };

  const handleNextTakt = async () => {
    enableAudio();
    setAudioEnabled(true);
    await nextTakt(lineId);
    await loadLine();
  };

  if (loading) {
    return (
      <div className="tv-container h-screen w-screen flex items-center justify-center">
        <div className="text-4xl text-slate-400 font-mono">Chargement...</div>
      </div>
    );
  }

  if (!line) {
    return (
      <div className="tv-container h-screen w-screen flex items-center justify-center">
        <div className="text-4xl text-red-400 font-mono">Ligne non trouvée</div>
      </div>
    );
  }

  const timerColor = showOvertime 
    ? 'text-red-400' 
    : status === 'running' 
      ? 'text-green-400' 
      : status === 'paused' || status === 'break'
        ? 'text-yellow-400'
        : 'text-slate-300';

  const progressColor = showOvertime
    ? 'from-red-500 to-red-600'
    : progressPercentage > 80
      ? 'from-yellow-500 to-orange-500'
      : 'from-blue-500 to-cyan-400';

  return (
    <div 
      className="tv-container h-screen w-screen flex flex-col overflow-hidden cursor-none"
      onMouseMove={handleMouseMove}
      onClick={handleMouseMove}
      data-testid="tv-display"
    >
      {/* Header */}
      <header className="flex items-center justify-between p-6 md:p-12">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="p-3 md:p-4 rounded-xl bg-blue-500/20 border border-blue-500/30">
            <Factory className="h-8 w-8 md:h-12 md:w-12 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl md:text-5xl font-heading font-bold text-white tracking-tight" data-testid="tv-line-name">
              {line.name}
            </h1>
          </div>
        </div>
        <StatusBadge status={status} />
      </header>

      {/* Main Timer */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 md:px-12 -mt-8">
        {/* Remaining Time - Main Focus */}
        <div className="text-center mb-8">
          <p className="text-xl md:text-2xl text-slate-500 uppercase tracking-widest mb-2">Temps Restant</p>
          <div 
            className={`tv-timer text-[20vw] md:text-[25vw] leading-none font-bold ${timerColor} ${status === 'running' ? 'timer-active' : ''}`}
            data-testid="tv-remaining-time"
          >
            {remainingFormatted}
          </div>
        </div>

        {/* Elapsed Time */}
        <div className="text-center mb-12">
          <p className="text-lg text-slate-600 uppercase tracking-wider mb-1">Temps Écoulé</p>
          <div className="tv-timer text-4xl md:text-6xl font-bold text-slate-400" data-testid="tv-elapsed-time">
            {elapsedFormatted}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-4xl">
          <div className="h-4 md:h-6 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
            <div 
              className={`h-full bg-gradient-to-r ${progressColor} rounded-full transition-all duration-1000 relative`}
              style={{ width: `${Math.min(100, progressPercentage)}%` }}
            >
              {status === 'running' && (
                <div className="absolute inset-0 progress-bar-shine" />
              )}
            </div>
          </div>
          <div className="flex justify-between mt-3 text-lg md:text-xl">
            <span className="text-slate-500 font-mono">{Math.round(progressPercentage)}%</span>
            <span className="text-slate-500 font-mono">{line.takt_duration} min</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between p-6 md:p-12 border-t border-slate-800">
        {/* Takt Counter */}
        <div className="flex items-center gap-6">
          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <Timer className="h-6 w-6 text-cyan-400" />
              <span className="text-slate-400 uppercase tracking-wider text-sm">Takt</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl md:text-6xl font-mono font-bold text-white" data-testid="tv-current-takt">
                {currentTakt}
              </span>
              <span className="text-2xl md:text-3xl font-mono text-slate-500">
                / {estimatedTakts}
              </span>
            </div>
          </div>
          
          {/* Remaining Takts */}
          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
            <p className="text-slate-400 uppercase tracking-wider text-sm mb-2">Restants</p>
            <span className="text-5xl md:text-6xl font-mono font-bold text-cyan-400" data-testid="tv-remaining-takts">
              {Math.max(0, estimatedTakts - currentTakt)}
            </span>
          </div>
        </div>

        {/* Schedule Info */}
        <div className="flex items-center gap-6">
          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="h-6 w-6 text-slate-400" />
              <span className="text-slate-400 uppercase tracking-wider text-sm">Horaires</span>
            </div>
            <div className="text-3xl md:text-4xl font-mono text-white">
              {schedule.start} - {schedule.end}
            </div>
          </div>

          {/* Audio Toggle */}
          <button
            onClick={audioEnabled ? () => setAudioEnabled(false) : handleEnableAudio}
            className={`p-4 rounded-xl border transition-all ${
              audioEnabled 
                ? 'bg-green-500/20 border-green-500/50 text-green-400' 
                : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:border-slate-600'
            }`}
            data-testid="audio-toggle"
          >
            {audioEnabled ? (
              <Volume2 className="h-8 w-8" />
            ) : (
              <VolumeX className="h-8 w-8" />
            )}
          </button>
        </div>
      </footer>

      {/* Floating Controls (shown on mouse move) */}
      <div 
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-4 p-4 rounded-2xl bg-slate-900/95 backdrop-blur-lg border border-slate-700 shadow-2xl transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        {autoStartEnabled ? (
          /* Auto-start enabled: only Pause/Resume */
          status === 'running' ? (
            <Button 
              onClick={handlePause}
              className="h-16 px-8 btn-pause text-slate-900 font-bold text-xl"
              data-testid="tv-pause-btn"
            >
              <Pause className="h-6 w-6 mr-3" />
              Suspendre
            </Button>
          ) : status === 'paused' || status === 'break' ? (
            <Button 
              onClick={handleStart}
              className="h-16 px-8 btn-start text-white font-bold text-xl"
              data-testid="tv-resume-btn"
            >
              <Play className="h-6 w-6 mr-3" />
              Reprendre
            </Button>
          ) : (
            <div className="h-16 px-8 flex items-center text-xl text-slate-500">
              Démarrage auto à {schedule.start}
            </div>
          )
        ) : (
          /* Auto-start disabled: Start/Pause/Resume */
          status === 'idle' || status === 'finished' ? (
            <Button 
              onClick={handleStart}
              className="h-16 px-8 btn-start text-white font-bold text-xl"
              data-testid="tv-start-btn"
            >
              <Play className="h-6 w-6 mr-3" />
              Démarrer
            </Button>
          ) : status === 'running' ? (
            <Button 
              onClick={handlePause}
              className="h-16 px-8 btn-pause text-slate-900 font-bold text-xl"
              data-testid="tv-pause-btn"
            >
              <Pause className="h-6 w-6 mr-3" />
              Suspendre
            </Button>
          ) : (
            <Button 
              onClick={handleStart}
              className="h-16 px-8 btn-start text-white font-bold text-xl"
              data-testid="tv-resume-btn"
            >
              <Play className="h-6 w-6 mr-3" />
              Reprendre
            </Button>
          )
        )}
        
        {/* Next Takt button - shown only when overtime and auto-next disabled */}
        {showNextTaktButton && (
          <Button 
            onClick={handleNextTakt}
            className="h-16 px-8 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xl"
            data-testid="tv-next-takt-btn"
          >
            <SkipForward className="h-6 w-6 mr-3" />
            Takt suivant
          </Button>
        )}
      </div>

      {/* Audio Enable Overlay */}
      {!audioEnabled && status === 'idle' && (
        <div 
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 cursor-pointer"
          onClick={handleEnableAudio}
          data-testid="audio-enable-overlay"
        >
          <div className="text-center p-12 rounded-3xl bg-slate-800/90 border border-slate-700 max-w-lg">
            <Volume2 className="h-20 w-20 text-blue-400 mx-auto mb-6" />
            <h2 className="text-3xl font-heading font-bold text-white mb-4">
              Cliquez pour activer le son
            </h2>
            <p className="text-slate-400 text-lg">
              Les navigateurs bloquent l'audio automatique. Cliquez n'importe où pour activer les alertes sonores.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
