import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTakt } from '@/context/TaktContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Play,
  Pause,
  Square,
  Settings,
  Tv,
  Plus,
  Trash2,
  Factory,
  Clock,
  Timer,
  SkipForward,
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
      className={`${config.className} font-medium uppercase tracking-wider text-xs px-3 py-1`}
      data-testid={`status-badge-${status}`}
    >
      {config.label}
    </Badge>
  );
};

const LineCard = ({ line, onDelete }) => {
  const navigate = useNavigate();
  const { startTakt, pauseTakt, stopTakt, nextTakt, enableAudio, playSound } = useTakt();
  const [isDeleting, setIsDeleting] = useState(false);

  const { 
    elapsedFormatted, 
    remainingFormatted, 
    progressPercentage,
    status,
    currentTakt,
    estimatedTakts,
  } = useTaktTimer(line, 
    () => playSound('takt_warning'),
    () => playSound('takt_end')
  );

  const handleStart = async () => {
    enableAudio();
    await startTakt(line.id);
  };

  const handlePause = async () => {
    await pauseTakt(line.id);
  };

  const handleStop = async () => {
    await stopTakt(line.id);
  };

  const handleNext = async () => {
    await nextTakt(line.id);
  };

  const cardGlow = status === 'running' ? 'card-glow-running' : status === 'paused' || status === 'break' ? 'card-glow-paused' : '';

  return (
    <>
      <Card 
        className={`bg-slate-800/50 border-slate-700 card-hover ${cardGlow} animate-fade-in-up`}
        data-testid={`line-card-${line.id}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Factory className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-lg font-heading text-slate-100">
                  {line.name}
                </CardTitle>
                <p className="text-sm text-slate-400 font-mono">ID: {line.id.slice(0, 8)}</p>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Timer Display */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Écoulé</p>
              <p className="text-2xl font-mono font-bold text-slate-100" data-testid="elapsed-time">
                {elapsedFormatted}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Restant</p>
              <p className="text-2xl font-mono font-bold text-green-400" data-testid="remaining-time">
                {remainingFormatted}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-1000"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Takt {currentTakt}/{estimatedTakts}</span>
              <span>{line.takt_duration} min/takt</span>
            </div>
          </div>

          {/* Info Row */}
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{line.day_start} - {line.day_end}</span>
            </div>
            <div className="flex items-center gap-1">
              <Timer className="h-4 w-4" />
              <span>{line.takt_duration} min</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex gap-2">
            {status === 'idle' || status === 'finished' ? (
              <Button 
                onClick={handleStart}
                className="flex-1 btn-start text-white font-semibold btn-control"
                data-testid="start-btn"
              >
                <Play className="h-4 w-4 mr-2" />
                Démarrer
              </Button>
            ) : status === 'running' ? (
              <>
                <Button 
                  onClick={handlePause}
                  className="flex-1 btn-pause text-slate-900 font-semibold btn-control"
                  data-testid="pause-btn"
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Suspendre
                </Button>
                <Button 
                  onClick={handleNext}
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700 btn-control"
                  data-testid="next-btn"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button 
                onClick={handleStart}
                className="flex-1 btn-start text-white font-semibold btn-control"
                data-testid="resume-btn"
              >
                <Play className="h-4 w-4 mr-2" />
                Reprendre
              </Button>
            )}
            <Button 
              onClick={handleStop}
              variant="outline"
              className="border-red-600/50 text-red-400 hover:bg-red-500/20 btn-control"
              disabled={status === 'idle'}
              data-testid="stop-btn"
            >
              <Square className="h-4 w-4" />
            </Button>
          </div>

          {/* Action Links */}
          <div className="flex gap-2 pt-2 border-t border-slate-700">
            <Button 
              variant="ghost" 
              size="sm"
              className="flex-1 text-slate-400 hover:text-slate-100 hover:bg-slate-700"
              onClick={() => navigate(`/config/${line.id}`)}
              data-testid="config-btn"
            >
              <Settings className="h-4 w-4 mr-2" />
              Configurer
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              className="flex-1 text-slate-400 hover:text-slate-100 hover:bg-slate-700"
              onClick={() => window.open(`/tv/${line.id}`, '_blank')}
              data-testid="tv-btn"
            >
              <Tv className="h-4 w-4 mr-2" />
              Affichage TV
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
              onClick={() => setIsDeleting(true)}
              data-testid="delete-btn"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Supprimer la ligne ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action supprimera définitivement la ligne "{line.name}" et tous ses paramètres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => onDelete(line.id)}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default function Dashboard() {
  const { lines, loading, fetchLines, deleteLine } = useTakt();
  const navigate = useNavigate();

  useEffect(() => {
    fetchLines();
    // Refresh every 5 seconds for timer sync
    const interval = setInterval(fetchLines, 5000);
    return () => clearInterval(interval);
  }, [fetchLines]);

  const handleDelete = async (lineId) => {
    await deleteLine(lineId);
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-8" data-testid="dashboard">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-slate-100 tracking-tight">
              Takt Time
            </h1>
            <p className="text-slate-400 mt-1">Gestion des lignes de production</p>
          </div>
          <Button 
            onClick={() => navigate('/config/new')}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 btn-control"
            data-testid="new-line-btn"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nouvelle ligne
          </Button>
        </div>
      </header>

      {/* Lines Grid */}
      {loading && lines.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Chargement...</div>
        </div>
      ) : lines.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Factory className="h-16 w-16 text-slate-600 mb-4" />
            <h3 className="text-xl font-heading text-slate-300 mb-2">Aucune ligne configurée</h3>
            <p className="text-slate-500 mb-6 text-center max-w-md">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {lines.map((line, index) => (
            <div key={line.id} className={`stagger-${(index % 4) + 1}`}>
              <LineCard line={line} onDelete={handleDelete} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
