import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTakt } from '@/context/TaktContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Play,
  Pause,
  Settings,
  Tv,
  Plus,
  Factory,
  Clock,
  Timer,
  Building2,
  BarChart3,
  Copy,
  Check,
  SkipForward,
  Coffee,
} from 'lucide-react';
import { useTaktTimer } from '@/hooks/useTaktTimer';

const StatusBadge = ({ status }) => {
  const statusConfig = {
    idle: { label: 'En attente', className: 'bg-slate-600/20 text-slate-400 border-slate-500' },
    running: { label: 'En cours', className: 'bg-green-500/20 text-green-400 border-green-500 status-running' },
    paused: { label: 'Suspendu', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500' },
    break: { label: 'Pause', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500' },
    finished: { label: 'Terminé', className: 'bg-red-500/20 text-red-400 border-red-500' },
  };

  const config = statusConfig[status] || statusConfig.idle;

  return (
    <Badge 
      variant="outline" 
      className={`${config.className} font-medium uppercase tracking-wider text-xs px-2 py-0.5`}
      data-testid={`status-badge-${status}`}
    >
      {config.label}
    </Badge>
  );
};

const LineCard = ({ line, onAutoStartTriggered }) => {
  const navigate = useNavigate();
  const { startTakt, pauseTakt, enableAudio, playSound, nextTakt, autoStartTakt, checkAutoStart, startBreak, endDay } = useTakt();
  const [copied, setCopied] = useState(false);
  const [autoStartChecked, setAutoStartChecked] = useState(false);

  // Check if auto-start is enabled
  const autoStartEnabled = line?.auto_start_at_day_begin ?? false;

  // Auto-start check on component mount
  useEffect(() => {
    const checkAndAutoStart = async () => {
      if (autoStartEnabled && !autoStartChecked && line?.state?.status === 'idle') {
        setAutoStartChecked(true);
        const result = await checkAutoStart(line.id);
        if (result.should_auto_start) {
          await autoStartTakt(line.id);
          if (onAutoStartTriggered) onAutoStartTriggered();
        }
      }
    };
    checkAndAutoStart();
  }, [autoStartEnabled, autoStartChecked, line?.id, line?.state?.status, checkAutoStart, autoStartTakt, onAutoStartTriggered]);

  const handleAutoNext = async () => {
    if (line?.auto_resume_after_takt) {
      try {
        await nextTakt(line.id);
      } catch (err) {
        console.error('Auto-next failed:', err);
      }
    }
  };

  const handleBreakStart = async (breakName, breakDuration) => {
    try {
      enableAudio();
      await startBreak(line.id, breakName, breakDuration);
    } catch (err) {
      console.error('Break start failed:', err);
    }
  };

  const handleDayEnd = async (elapsedSeconds) => {
    try {
      console.log('[Dashboard] Day end triggered, saving carryover');
      await endDay(line.id);
    } catch (err) {
      console.error('Day end failed:', err);
    }
  };

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
    currentBreakName,
  } = useTaktTimer(
    line, 
    () => playSound('takt_warning'),
    () => playSound('takt_end'),
    handleAutoNext,
    handleBreakStart,
    handleDayEnd
  );

  // Don't show overtime if auto-next is enabled
  const showOvertime = isOvertime && !line?.auto_resume_after_takt;
  
  // Show next takt button only when overtime AND auto-next is disabled
  const showNextTaktButton = showOvertime;

  const handleStart = async () => {
    enableAudio();
    await startTakt(line.id);
  };

  const handlePause = async () => {
    await pauseTakt(line.id);
  };

  const handleNextTakt = async () => {
    enableAudio();
    await nextTakt(line.id);
  };

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

  // Generate TV URL
  const tvUrl = `${window.location.origin}/tv/${line.id}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(tvUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cardGlow = status === 'running' ? 'card-glow-running' : status === 'paused' || status === 'break' ? 'card-glow-paused' : '';

  return (
    <>
      <Card 
        className={`bg-slate-800/50 border-slate-700 card-hover ${cardGlow} animate-fade-in-up`}
        data-testid={`line-card-${line.id}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="p-1.5 rounded-lg bg-blue-500/20 flex-shrink-0">
                <Factory className="h-4 w-4 text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base font-heading text-slate-100 truncate">
                  {line.name}
                </CardTitle>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Break Display - shown when on break */}
          {status === 'break' && currentBreakName && (
            <div className="p-3 rounded-lg bg-yellow-500/20 border border-yellow-500/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coffee className="h-4 w-4 text-yellow-400" />
                  <span className="text-yellow-400 font-medium">{currentBreakName}</span>
                </div>
                <span className="text-2xl font-mono font-bold text-yellow-400">
                  {breakRemainingFormatted}
                </span>
              </div>
            </div>
          )}

          {/* Timer Display */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Écoulé</p>
              <p className="text-lg font-mono font-bold text-slate-100" data-testid="elapsed-time">
                {elapsedFormatted}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Restant</p>
              <p className={`text-lg font-mono font-bold ${showOvertime ? 'text-red-400' : 'text-green-400'}`} data-testid="remaining-time">
                {remainingFormatted}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ${
                  showOvertime ? 'bg-gradient-to-r from-red-500 to-red-600' : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                }`}
                style={{ width: `${Math.min(100, progressPercentage)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Takt {currentTakt}/{estimatedTakts}</span>
              <span>{activeTaktDuration} min/takt</span>
            </div>
          </div>

          {/* Info Row */}
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{schedule.start} - {schedule.end}</span>
            </div>
          </div>

          {/* Next Takt Button - Only shown when overtime and auto-next disabled */}
          {showNextTaktButton && (
            <Button 
              onClick={handleNextTakt}
              className="w-full h-9 bg-orange-600 hover:bg-orange-500 text-white font-semibold btn-control text-sm"
              data-testid="next-takt-btn"
            >
              <SkipForward className="h-3.5 w-3.5 mr-1.5" />
              Takt suivant
            </Button>
          )}

          {/* Control Buttons */}
          <div className="flex gap-1.5">
            {autoStartEnabled ? (
              /* Auto-start enabled: only Pause/Resume buttons */
              status === 'running' ? (
                <Button 
                  onClick={handlePause}
                  className="flex-1 h-9 btn-pause text-slate-900 font-semibold btn-control text-sm"
                  data-testid="pause-btn"
                >
                  <Pause className="h-3.5 w-3.5 mr-1.5" />
                  Suspendre
                </Button>
              ) : status === 'paused' || status === 'break' ? (
                <Button 
                  onClick={handleStart}
                  className="flex-1 h-9 btn-start text-white font-semibold btn-control text-sm"
                  data-testid="resume-btn"
                >
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Reprendre
                </Button>
              ) : (
                <div className="flex-1 h-9 flex items-center justify-center text-sm text-slate-500">
                  Démarrage auto à {schedule.start}
                </div>
              )
            ) : (
              /* Auto-start disabled: Start/Pause/Resume buttons */
              status === 'idle' || status === 'finished' ? (
                <Button 
                  onClick={handleStart}
                  className="flex-1 h-9 btn-start text-white font-semibold btn-control text-sm"
                  data-testid="start-btn"
                >
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Démarrer
                </Button>
              ) : status === 'running' ? (
                <Button 
                  onClick={handlePause}
                  className="flex-1 h-9 btn-pause text-slate-900 font-semibold btn-control text-sm"
                  data-testid="pause-btn"
                >
                  <Pause className="h-3.5 w-3.5 mr-1.5" />
                  Suspendre
                </Button>
              ) : (
                <Button 
                  onClick={handleStart}
                  className="flex-1 h-9 btn-start text-white font-semibold btn-control text-sm"
                  data-testid="resume-btn"
                >
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Reprendre
                </Button>
              )
            )}
          </div>

          {/* Action Links */}
          <div className="flex gap-1 pt-2 border-t border-slate-700">
            <Button 
              variant="ghost" 
              size="sm"
              className="flex-1 h-8 text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-700 px-2"
              onClick={() => navigate(`/config/${line.id}`)}
              data-testid="config-btn"
            >
              <Settings className="h-3 w-3 mr-1" />
              Config
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              className="flex-1 h-8 text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-700 px-2"
              onClick={() => window.open(`/tv/${line.id}`, '_blank')}
              data-testid="tv-btn"
            >
              <Tv className="h-3 w-3 mr-1" />
              TV
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              className="flex-1 h-8 text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-700 px-2"
              onClick={handleCopyUrl}
              data-testid="copy-url-btn"
            >
              {copied ? <Check className="h-3 w-3 mr-1 text-green-400" /> : <Copy className="h-3 w-3 mr-1" />}
              {copied ? 'Copié' : 'URL'}
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              className="flex-1 h-8 text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-700 px-2"
              onClick={() => navigate(`/statistics/${line.id}`)}
              data-testid="stats-btn"
            >
              <BarChart3 className="h-3 w-3 mr-1" />
              Stats
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default function Dashboard() {
  const { sites, lines, loading, fetchSites, fetchLines, deleteLine } = useTakt();
  const navigate = useNavigate();
  const [selectedSite, setSelectedSite] = useState('all');

  useEffect(() => {
    fetchSites();
    fetchLines();
    const interval = setInterval(fetchLines, 5000);
    return () => clearInterval(interval);
  }, [fetchSites, fetchLines]);

  const handleDelete = async (lineId) => {
    await deleteLine(lineId);
  };

  const filteredLines = selectedSite === 'all' 
    ? lines 
    : lines.filter(l => l.site_id === selectedSite);

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 lg:p-8" data-testid="dashboard">
      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-bold text-slate-100 tracking-tight">
                Takt Time
              </h1>
              <p className="text-slate-400 text-sm mt-1">Gestion des lignes de production</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={() => navigate('/sites')}
                variant="outline"
                className="border-slate-600 text-slate-300 hover:bg-slate-700 h-9 text-sm"
                data-testid="sites-btn"
              >
                <Building2 className="h-4 w-4 mr-2" />
                Sites
              </Button>
              <Button 
                onClick={() => navigate('/statistics')}
                variant="outline"
                className="border-slate-600 text-slate-300 hover:bg-slate-700 h-9 text-sm"
                data-testid="stats-btn"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Statistiques
              </Button>
              <Button 
                onClick={() => navigate('/config/new')}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold h-9 text-sm"
                data-testid="new-line-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle ligne
              </Button>
            </div>
          </div>
          
          {/* Site Filter */}
          {sites.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Filtrer par site:</span>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="w-[200px] h-9 bg-slate-800 border-slate-700 text-slate-100 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">Tous les sites</SelectItem>
                  {sites.map(site => (
                    <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </header>

      {/* Lines Grid */}
      {loading && lines.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Chargement...</div>
        </div>
      ) : filteredLines.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16">
            <Factory className="h-12 w-12 sm:h-16 sm:w-16 text-slate-600 mb-4" />
            <h3 className="text-lg sm:text-xl font-heading text-slate-300 mb-2 text-center">
              {selectedSite === 'all' ? 'Aucune ligne configurée' : 'Aucune ligne sur ce site'}
            </h3>
            <p className="text-slate-500 mb-6 text-center max-w-md text-sm">
              Créez votre première ligne de production pour commencer à utiliser le Takt Time.
            </p>
            <Button 
              onClick={() => navigate('/config/new')}
              className="bg-blue-600 hover:bg-blue-500 text-white"
              data-testid="empty-new-line-btn"
            >
              <Plus className="h-5 w-5 mr-2" />
              Créer une ligne
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {filteredLines.map((line, index) => (
            <div key={line.id} className={`stagger-${(index % 4) + 1}`}>
              <LineCard line={line} onAutoStartTriggered={fetchLines} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
