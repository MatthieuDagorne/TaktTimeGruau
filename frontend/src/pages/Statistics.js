import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTakt } from '@/context/TaktContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Download,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Calendar,
  Factory,
  Timer,
} from 'lucide-react';

export default function Statistics() {
  const { lineId } = useParams();
  const navigate = useNavigate();
  const { lines, fetchLines, fetchStatistics, fetchEvents, exportCSV } = useTakt();
  const [selectedLine, setSelectedLine] = useState(lineId || '');
  const [selectedDays, setSelectedDays] = useState('1');
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  useEffect(() => {
    if (lineId) {
      setSelectedLine(lineId);
    }
  }, [lineId]);

  useEffect(() => {
    if (selectedLine) {
      loadData();
    }
  }, [selectedLine, selectedDays]);

  const loadData = async () => {
    if (!selectedLine) return;
    setLoading(true);
    try {
      const [statsData, eventsData] = await Promise.all([
        fetchStatistics(selectedLine, parseInt(selectedDays)),
        fetchEvents(selectedLine, null, parseInt(selectedDays))
      ]);
      setStats(statsData);
      setEvents(eventsData || []);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    exportCSV(selectedLine, null, parseInt(selectedDays));
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const eventTypeLabels = {
    'takt_start': 'Début Takt',
    'takt_end': 'Fin Takt',
    'takt_pause': 'Suspension',
    'takt_resume': 'Reprise',
    'break_start': 'Début Pause',
    'break_end': 'Fin Pause',
  };

  const eventTypeColors = {
    'takt_start': 'bg-green-500/20 text-green-400 border-green-500',
    'takt_end': 'bg-blue-500/20 text-blue-400 border-blue-500',
    'takt_pause': 'bg-yellow-500/20 text-yellow-400 border-yellow-500',
    'takt_resume': 'bg-cyan-500/20 text-cyan-400 border-cyan-500',
    'break_start': 'bg-orange-500/20 text-orange-400 border-orange-500',
    'break_end': 'bg-purple-500/20 text-purple-400 border-purple-500',
  };

  const selectedLineName = lines.find(l => l.id === selectedLine)?.name || '';

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-8" data-testid="statistics-page">
      {/* Header */}
      <header className="mb-8">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/')}
          className="mb-4 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          data-testid="back-btn"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour au tableau de bord
        </Button>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-slate-100 tracking-tight">
              Statistiques & Historique
            </h1>
            <p className="text-slate-400 mt-1">Analysez la performance de vos lignes</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedLine} onValueChange={setSelectedLine}>
              <SelectTrigger className="w-full sm:w-[250px] bg-slate-800 border-slate-700 text-slate-100">
                <Factory className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Sélectionner une ligne" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {lines.map(line => (
                  <SelectItem key={line.id} value={line.id}>{line.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedDays} onValueChange={setSelectedDays}>
              <SelectTrigger className="w-full sm:w-[150px] bg-slate-800 border-slate-700 text-slate-100">
                <Calendar className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="1">1 jour</SelectItem>
                <SelectItem value="2">2 jours</SelectItem>
                <SelectItem value="7">7 jours</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              onClick={handleExport}
              disabled={!selectedLine}
              className="bg-green-600 hover:bg-green-500 text-white"
              data-testid="export-btn"
            >
              <Download className="h-4 w-4 mr-2" />
              Exporter CSV
            </Button>
          </div>
        </div>
      </header>

      {!selectedLine ? (
        <Card className="bg-slate-800/50 border-slate-700 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BarChart3 className="h-16 w-16 text-slate-600 mb-4" />
            <h3 className="text-xl font-heading text-slate-300 mb-2">Sélectionnez une ligne</h3>
            <p className="text-slate-500 text-center max-w-md">
              Choisissez une ligne de production pour voir ses statistiques et son historique.
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Chargement des statistiques...</div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Takts */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400 uppercase tracking-wider">Takts Complétés</p>
                    <p className="text-4xl font-mono font-bold text-slate-100 mt-2">
                      {stats?.completed_takts || 0}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-500/20">
                    <Timer className="h-8 w-8 text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Average Duration */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400 uppercase tracking-wider">Durée Moyenne</p>
                    <p className="text-4xl font-mono font-bold text-slate-100 mt-2">
                      {formatDuration(Math.round(stats?.average_duration_seconds || 0))}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      Attendu: {formatDuration(stats?.expected_duration_seconds || 0)}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-cyan-500/20">
                    <Clock className="h-8 w-8 text-cyan-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* On-Time Rate */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400 uppercase tracking-wider">Taux de Respect</p>
                    <p className={`text-4xl font-mono font-bold mt-2 ${
                      (stats?.on_time_percentage || 0) >= 80 ? 'text-green-400' :
                      (stats?.on_time_percentage || 0) >= 60 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {stats?.on_time_percentage || 0}%
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {stats?.on_time_count || 0} / {stats?.total_takts || 0} à l'heure
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl ${
                    (stats?.on_time_percentage || 0) >= 80 ? 'bg-green-500/20' : 'bg-yellow-500/20'
                  }`}>
                    {(stats?.on_time_percentage || 0) >= 80 ? (
                      <CheckCircle className="h-8 w-8 text-green-400" />
                    ) : (
                      <TrendingDown className="h-8 w-8 text-yellow-400" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Overtime */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400 uppercase tracking-wider">Retards</p>
                    <p className={`text-4xl font-mono font-bold mt-2 ${
                      (stats?.overtime_count || 0) === 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {stats?.overtime_count || 0}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      Total: {formatDuration(stats?.total_overtime_seconds || 0)}
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl ${
                    (stats?.overtime_count || 0) === 0 ? 'bg-green-500/20' : 'bg-red-500/20'
                  }`}>
                    <AlertTriangle className={`h-8 w-8 ${
                      (stats?.overtime_count || 0) === 0 ? 'text-green-400' : 'text-red-400'
                    }`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Events Table */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-slate-100">Historique des Événements</CardTitle>
                  <CardDescription className="text-slate-400">
                    {events.length} événement(s) sur les {selectedDays} dernier(s) jour(s)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-center text-slate-500 py-8">Aucun événement enregistré</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700">
                        <TableHead className="text-slate-400">Horodatage</TableHead>
                        <TableHead className="text-slate-400">Type</TableHead>
                        <TableHead className="text-slate-400">N° Takt</TableHead>
                        <TableHead className="text-slate-400">Durée</TableHead>
                        <TableHead className="text-slate-400">Retard</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.slice(0, 50).map((event) => (
                        <TableRow key={event.id} className="border-slate-700">
                          <TableCell className="font-mono text-sm text-slate-300">
                            {formatTimestamp(event.timestamp)}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline"
                              className={eventTypeColors[event.event_type] || 'bg-slate-600/20 text-slate-400 border-slate-500'}
                            >
                              {eventTypeLabels[event.event_type] || event.event_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-slate-300">
                            {event.takt_number || '-'}
                          </TableCell>
                          <TableCell className="font-mono text-slate-300">
                            {event.duration_seconds ? formatDuration(event.duration_seconds) : '-'}
                          </TableCell>
                          <TableCell>
                            {event.is_overtime ? (
                              <span className="text-red-400 font-mono">
                                +{formatDuration(event.overtime_seconds)}
                              </span>
                            ) : event.event_type === 'takt_end' ? (
                              <span className="text-green-400">À l'heure</span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {events.length > 50 && (
                    <p className="text-center text-slate-500 py-4">
                      Affichage des 50 derniers événements. Exportez en CSV pour voir tout l'historique.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
