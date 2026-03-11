import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTakt } from '@/context/TaktContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  Factory,
  Clock,
  Timer,
  Coffee,
  Bell,
  Calculator,
  Volume2,
} from 'lucide-react';

export default function LineConfig() {
  const { lineId } = useParams();
  const navigate = useNavigate();
  const { fetchLine, createLine, updateLine } = useTakt();
  const isNew = !lineId || lineId === 'new';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    takt_duration: 30,
    day_start: '08:00',
    day_end: '17:00',
    breaks: [
      { name: 'Pause Matin', start_time: '10:00', duration: 15 },
      { name: 'Pause Midi', start_time: '12:00', duration: 60 },
      { name: 'Pause Après-midi', start_time: '15:00', duration: 15 },
    ],
    auto_resume_after_break: true,
    auto_resume_after_takt: true,
    sound_alerts: {
      takt_start: true,
      minutes_before_takt_end: 5,
      takt_end: true,
      break_start: true,
      minutes_before_break_end: 5,
      break_end: true,
    },
  });

  const [estimatedTakts, setEstimatedTakts] = useState(0);

  useEffect(() => {
    if (!isNew && lineId) {
      setLoading(true);
      loadLine();
    }
  }, [lineId, isNew]);

  useEffect(() => {
    calculateEstimatedTakts();
  }, [formData.day_start, formData.day_end, formData.breaks, formData.takt_duration]);

  const loadLine = async () => {
    try {
      const data = await fetchLine(lineId);
      setFormData({
        name: data.name || '',
        takt_duration: data.takt_duration || 30,
        day_start: data.day_start || '08:00',
        day_end: data.day_end || '17:00',
        breaks: data.breaks || formData.breaks,
        auto_resume_after_break: data.auto_resume_after_break ?? true,
        auto_resume_after_takt: data.auto_resume_after_takt ?? true,
        sound_alerts: data.sound_alerts || formData.sound_alerts,
      });
      setEstimatedTakts(data.estimated_takts || 0);
    } catch (err) {
      toast.error('Erreur lors du chargement de la ligne');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const calculateEstimatedTakts = () => {
    try {
      const [startH, startM] = formData.day_start.split(':').map(Number);
      const [endH, endM] = formData.day_end.split(':').map(Number);
      
      let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      
      formData.breaks.forEach(b => {
        if (b.duration > 0) {
          totalMinutes -= b.duration;
        }
      });

      const takts = Math.floor(totalMinutes / formData.takt_duration);
      setEstimatedTakts(Math.max(0, takts));
    } catch {
      setEstimatedTakts(0);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Le nom de la ligne est requis');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        await createLine(formData);
        toast.success('Ligne créée avec succès');
      } else {
        await updateLine(lineId, formData);
        toast.success('Ligne mise à jour avec succès');
      }
      navigate('/');
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const updateBreak = (index, field, value) => {
    const newBreaks = [...formData.breaks];
    newBreaks[index] = { ...newBreaks[index], [field]: value };
    setFormData({ ...formData, breaks: newBreaks });
  };

  const updateSoundAlert = (field, value) => {
    setFormData({
      ...formData,
      sound_alerts: { ...formData.sound_alerts, [field]: value },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-8" data-testid="line-config">
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
        <h1 className="text-3xl md:text-4xl font-heading font-bold text-slate-100 tracking-tight">
          {isNew ? 'Nouvelle ligne' : 'Configuration'}
        </h1>
        <p className="text-slate-400 mt-1">
          {isNew ? 'Créez une nouvelle ligne de production' : `Modifier les paramètres de "${formData.name}"`}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Config */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Factory className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-slate-100">Informations générales</CardTitle>
                    <CardDescription className="text-slate-400">Identité de la ligne</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-300">Nom de la ligne</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="ex: Ligne A - Assemblage"
                    className="bg-slate-900/50 border-slate-700 text-slate-100 h-12"
                    data-testid="line-name-input"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Time Settings */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/20">
                    <Clock className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-slate-100">Horaires de travail</CardTitle>
                    <CardDescription className="text-slate-400">Définissez les horaires de la journée</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="day_start" className="text-slate-300">Début de journée</Label>
                    <Input
                      id="day_start"
                      type="time"
                      value={formData.day_start}
                      onChange={(e) => setFormData({ ...formData, day_start: e.target.value })}
                      className="bg-slate-900/50 border-slate-700 text-slate-100 h-12"
                      data-testid="day-start-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="day_end" className="text-slate-300">Fin de journée</Label>
                    <Input
                      id="day_end"
                      type="time"
                      value={formData.day_end}
                      onChange={(e) => setFormData({ ...formData, day_end: e.target.value })}
                      className="bg-slate-900/50 border-slate-700 text-slate-100 h-12"
                      data-testid="day-end-input"
                    />
                  </div>
                </div>

                <Separator className="bg-slate-700" />

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Timer className="h-5 w-5 text-green-400" />
                    <div>
                      <Label className="text-slate-300">Durée du Takt</Label>
                      <p className="text-sm text-slate-500">Entre 20 et 40 minutes</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Slider
                      value={[formData.takt_duration]}
                      onValueChange={([val]) => setFormData({ ...formData, takt_duration: val })}
                      min={20}
                      max={40}
                      step={1}
                      className="w-full"
                      data-testid="takt-duration-slider"
                    />
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">20 min</span>
                      <span className="text-2xl font-mono font-bold text-green-400">{formData.takt_duration} min</span>
                      <span className="text-slate-500">40 min</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Breaks */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/20">
                    <Coffee className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-slate-100">Pauses</CardTitle>
                    <CardDescription className="text-slate-400">Configurez les pauses de la journée</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {formData.breaks.map((breakItem, index) => (
                  <div key={index} className="p-4 rounded-lg bg-slate-900/50 border border-slate-700 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-300">{breakItem.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-slate-400 text-sm">Heure de début</Label>
                        <Input
                          type="time"
                          value={breakItem.start_time}
                          onChange={(e) => updateBreak(index, 'start_time', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-slate-100 h-10"
                          data-testid={`break-${index}-start`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-400 text-sm">Durée (minutes)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={120}
                          value={breakItem.duration}
                          onChange={(e) => updateBreak(index, 'duration', parseInt(e.target.value) || 0)}
                          className="bg-slate-800 border-slate-600 text-slate-100 h-10"
                          data-testid={`break-${index}-duration`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Options */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Bell className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-slate-100">Options</CardTitle>
                    <CardDescription className="text-slate-400">Comportement automatique</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/50 border border-slate-700">
                  <div>
                    <p className="font-medium text-slate-300">Reprise auto après pause</p>
                    <p className="text-sm text-slate-500">Le takt reprend automatiquement après les pauses</p>
                  </div>
                  <Switch
                    checked={formData.auto_resume_after_break}
                    onCheckedChange={(checked) => setFormData({ ...formData, auto_resume_after_break: checked })}
                    data-testid="auto-resume-break-switch"
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/50 border border-slate-700">
                  <div>
                    <p className="font-medium text-slate-300">Reprise auto après takt</p>
                    <p className="text-sm text-slate-500">Enchaîne automatiquement les takts</p>
                  </div>
                  <Switch
                    checked={formData.auto_resume_after_takt}
                    onCheckedChange={(checked) => setFormData({ ...formData, auto_resume_after_takt: checked })}
                    data-testid="auto-resume-takt-switch"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Sound Alerts */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/20">
                    <Volume2 className="h-5 w-5 text-orange-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-slate-100">Alertes sonores</CardTitle>
                    <CardDescription className="text-slate-400">Configurez les notifications audio</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <span className="text-slate-300 text-sm">Début de takt</span>
                    <Switch
                      checked={formData.sound_alerts.takt_start}
                      onCheckedChange={(checked) => updateSoundAlert('takt_start', checked)}
                      data-testid="sound-takt-start"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <span className="text-slate-300 text-sm">Fin de takt</span>
                    <Switch
                      checked={formData.sound_alerts.takt_end}
                      onCheckedChange={(checked) => updateSoundAlert('takt_end', checked)}
                      data-testid="sound-takt-end"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <span className="text-slate-300 text-sm">Début de pause</span>
                    <Switch
                      checked={formData.sound_alerts.break_start}
                      onCheckedChange={(checked) => updateSoundAlert('break_start', checked)}
                      data-testid="sound-break-start"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <span className="text-slate-300 text-sm">Fin de pause</span>
                    <Switch
                      checked={formData.sound_alerts.break_end}
                      onCheckedChange={(checked) => updateSoundAlert('break_end', checked)}
                      data-testid="sound-break-end"
                    />
                  </div>
                </div>

                <Separator className="bg-slate-700" />

                <div className="space-y-3">
                  <Label className="text-slate-300">Alerte avant fin de takt (minutes)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[formData.sound_alerts.minutes_before_takt_end]}
                      onValueChange={([val]) => updateSoundAlert('minutes_before_takt_end', val)}
                      min={1}
                      max={15}
                      step={1}
                      className="flex-1"
                      data-testid="warning-minutes-slider"
                    />
                    <span className="text-lg font-mono font-bold text-orange-400 w-16 text-right">
                      {formData.sound_alerts.minutes_before_takt_end} min
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-slate-300">Alerte avant fin de pause (minutes)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[formData.sound_alerts.minutes_before_break_end]}
                      onValueChange={([val]) => updateSoundAlert('minutes_before_break_end', val)}
                      min={1}
                      max={15}
                      step={1}
                      className="flex-1"
                      data-testid="break-warning-minutes-slider"
                    />
                    <span className="text-lg font-mono font-bold text-orange-400 w-16 text-right">
                      {formData.sound_alerts.minutes_before_break_end} min
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Estimated Takts */}
            <Card className="bg-slate-800/50 border-slate-700 sticky top-4">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <Calculator className="h-5 w-5 text-green-400" />
                  </div>
                  <CardTitle className="text-lg text-slate-100">Estimation</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <p className="text-6xl font-mono font-bold text-green-400" data-testid="estimated-takts">
                    {estimatedTakts}
                  </p>
                  <p className="text-slate-400 mt-2">takts estimés / jour</p>
                </div>
                <Separator className="bg-slate-700 my-4" />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-400">
                    <span>Durée takt</span>
                    <span className="font-mono">{formData.takt_duration} min</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Temps total pauses</span>
                    <span className="font-mono">{formData.breaks.reduce((a, b) => a + b.duration, 0)} min</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <Button 
              type="submit"
              disabled={saving}
              className="w-full h-14 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-lg btn-control"
              data-testid="save-btn"
            >
              <Save className="h-5 w-5 mr-2" />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
