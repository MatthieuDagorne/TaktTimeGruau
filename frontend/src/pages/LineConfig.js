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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Building2,
  Users,
  Calendar,
} from 'lucide-react';

const DAYS = [
  { key: 'monday', label: 'Lundi' },
  { key: 'tuesday', label: 'Mardi' },
  { key: 'wednesday', label: 'Mercredi' },
  { key: 'thursday', label: 'Jeudi' },
  { key: 'friday', label: 'Vendredi' },
  { key: 'saturday', label: 'Samedi' },
  { key: 'sunday', label: 'Dimanche' },
];

const defaultDaySchedule = {
  day_start: '08:00',
  day_end: '17:00',
  is_working_day: true,
  breaks: [],
};

const defaultWeeklySchedule = {
  monday: { ...defaultDaySchedule },
  tuesday: { ...defaultDaySchedule },
  wednesday: { ...defaultDaySchedule },
  thursday: { ...defaultDaySchedule },
  friday: { day_start: '08:00', day_end: '16:00', is_working_day: true, breaks: [] },
  saturday: { ...defaultDaySchedule, is_working_day: false },
  sunday: { ...defaultDaySchedule, is_working_day: false },
};

export default function LineConfig() {
  const { lineId } = useParams();
  const navigate = useNavigate();
  const { sites, fetchSites, fetchLine, createLine, updateLine } = useTakt();
  const isNew = !lineId || lineId === 'new';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    site_id: '',
    takt_duration: 30,
    team_config: {
      name: 'Équipe Standard',
      shift_type: '1x8',
      weekly_schedule: { ...defaultWeeklySchedule },
    },
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
  const [selectedDay, setSelectedDay] = useState('monday');

  useEffect(() => {
    fetchSites();
    if (!isNew && lineId) {
      setLoading(true);
      loadLine();
    }
  }, [lineId, isNew, fetchSites]);

  useEffect(() => {
    calculateEstimatedTakts();
  }, [formData.team_config?.weekly_schedule, formData.breaks, formData.takt_duration]);

  const loadLine = async () => {
    try {
      const data = await fetchLine(lineId);
      setFormData({
        name: data.name || '',
        site_id: data.site_id || '',
        takt_duration: data.takt_duration || 30,
        team_config: data.team_config || formData.team_config,
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
      const schedule = formData.team_config?.weekly_schedule?.monday || defaultDaySchedule;
      if (!schedule.is_working_day) {
        setEstimatedTakts(0);
        return;
      }
      
      const [startH, startM] = (schedule.day_start || '08:00').split(':').map(Number);
      const [endH, endM] = (schedule.day_end || '17:00').split(':').map(Number);
      
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

  const updateDaySchedule = (dayKey, field, value) => {
    setFormData(prev => ({
      ...prev,
      team_config: {
        ...prev.team_config,
        weekly_schedule: {
          ...prev.team_config.weekly_schedule,
          [dayKey]: {
            ...prev.team_config.weekly_schedule[dayKey],
            [field]: value,
          },
        },
      },
    }));
  };

  const copyToAllDays = () => {
    const sourceSchedule = formData.team_config.weekly_schedule[selectedDay];
    const newSchedule = { ...formData.team_config.weekly_schedule };
    DAYS.forEach(({ key }) => {
      if (key !== 'saturday' && key !== 'sunday') {
        newSchedule[key] = { ...sourceSchedule };
      }
    });
    setFormData(prev => ({
      ...prev,
      team_config: {
        ...prev.team_config,
        weekly_schedule: newSchedule,
      },
    }));
    toast.success('Horaires copiés sur tous les jours ouvrés');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Chargement...</div>
      </div>
    );
  }

  const currentDaySchedule = formData.team_config?.weekly_schedule?.[selectedDay] || defaultDaySchedule;

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 lg:p-8" data-testid="line-config">
      {/* Header */}
      <header className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/')}
          className="mb-4 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          data-testid="back-btn"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour au tableau de bord
        </Button>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-bold text-slate-100 tracking-tight">
          {isNew ? 'Nouvelle ligne' : 'Configuration'}
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          {isNew ? 'Créez une nouvelle ligne de production' : `Modifier les paramètres de "${formData.name}"`}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="max-w-6xl">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Main Config - 3 columns on xl */}
          <div className="xl:col-span-3 space-y-6">
            {/* Basic Info & Site */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-4">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-slate-300">Nom de la ligne *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="ex: Ligne A - Assemblage"
                      className="bg-slate-900/50 border-slate-700 text-slate-100 h-11"
                      data-testid="line-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="site" className="text-slate-300">Site</Label>
                    <Select 
                      value={formData.site_id || 'none'} 
                      onValueChange={(val) => setFormData({ ...formData, site_id: val === 'none' ? '' : val })}
                    >
                      <SelectTrigger className="bg-slate-900/50 border-slate-700 text-slate-100 h-11">
                        <Building2 className="h-4 w-4 mr-2 text-slate-400" />
                        <SelectValue placeholder="Sélectionner un site" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="none">Aucun site</SelectItem>
                        {sites.map(site => (
                          <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team & Schedule */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Users className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-slate-100">Équipe & Horaires</CardTitle>
                    <CardDescription className="text-slate-400">Configuration des équipes et horaires par jour</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Nom de l'équipe</Label>
                    <Input
                      value={formData.team_config?.name || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        team_config: { ...prev.team_config, name: e.target.value }
                      }))}
                      placeholder="ex: Équipe Matin"
                      className="bg-slate-900/50 border-slate-700 text-slate-100 h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Type d'organisation</Label>
                    <Select 
                      value={formData.team_config?.shift_type || '1x8'}
                      onValueChange={(val) => setFormData(prev => ({
                        ...prev,
                        team_config: { ...prev.team_config, shift_type: val }
                      }))}
                    >
                      <SelectTrigger className="bg-slate-900/50 border-slate-700 text-slate-100 h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="1x8">1×8 (Une équipe)</SelectItem>
                        <SelectItem value="2x8">2×8 (Deux équipes)</SelectItem>
                        <SelectItem value="3x8">3×8 (Trois équipes)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator className="bg-slate-700" />

                {/* Day-by-day Schedule */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-cyan-400" />
                      <Label className="text-slate-300">Horaires par jour</Label>
                    </div>
                    <Button 
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyToAllDays}
                      className="border-slate-600 text-slate-300 h-8 text-xs"
                    >
                      Copier aux jours ouvrés
                    </Button>
                  </div>

                  <Tabs value={selectedDay} onValueChange={setSelectedDay}>
                    <TabsList className="bg-slate-900/50 border border-slate-700 h-auto flex-wrap">
                      {DAYS.map(({ key, label }) => (
                        <TabsTrigger 
                          key={key}
                          value={key}
                          className="data-[state=active]:bg-slate-700 text-xs px-2 py-1.5"
                        >
                          {label.slice(0, 3)}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {DAYS.map(({ key, label }) => (
                      <TabsContent key={key} value={key} className="mt-4">
                        <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700 space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-slate-200">{label}</h4>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-400">Jour travaillé</span>
                              <Switch
                                checked={currentDaySchedule.is_working_day}
                                onCheckedChange={(checked) => updateDaySchedule(key, 'is_working_day', checked)}
                              />
                            </div>
                          </div>

                          {currentDaySchedule.is_working_day && (
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label className="text-slate-400 text-sm">Début de journée</Label>
                                <Input
                                  type="time"
                                  value={currentDaySchedule.day_start || '08:00'}
                                  onChange={(e) => updateDaySchedule(key, 'day_start', e.target.value)}
                                  className="bg-slate-800 border-slate-600 text-slate-100 h-10"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-slate-400 text-sm">Fin de journée</Label>
                                <Input
                                  type="time"
                                  value={currentDaySchedule.day_end || '17:00'}
                                  onChange={(e) => updateDaySchedule(key, 'day_end', e.target.value)}
                                  className="bg-slate-800 border-slate-600 text-slate-100 h-10"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>

                <Separator className="bg-slate-700" />

                {/* Takt Duration */}
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
              <CardHeader className="pb-4">
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
              <CardContent className="space-y-3">
                {formData.breaks.map((breakItem, index) => (
                  <div key={index} className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-slate-300 text-sm">{breakItem.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-slate-400 text-xs">Heure de début</Label>
                        <Input
                          type="time"
                          value={breakItem.start_time}
                          onChange={(e) => updateBreak(index, 'start_time', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-slate-100 h-9"
                          data-testid={`break-${index}-start`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-slate-400 text-xs">Durée (min)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={120}
                          value={breakItem.duration}
                          onChange={(e) => updateBreak(index, 'duration', parseInt(e.target.value) || 0)}
                          className="bg-slate-800 border-slate-600 text-slate-100 h-9"
                          data-testid={`break-${index}-duration`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Options & Sound Alerts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Options */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-500/20">
                      <Bell className="h-5 w-5 text-indigo-400" />
                    </div>
                    <CardTitle className="text-lg text-slate-100">Options</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <div>
                      <p className="font-medium text-slate-300 text-sm">Reprise auto après pause</p>
                    </div>
                    <Switch
                      checked={formData.auto_resume_after_break}
                      onCheckedChange={(checked) => setFormData({ ...formData, auto_resume_after_break: checked })}
                      data-testid="auto-resume-break-switch"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <div>
                      <p className="font-medium text-slate-300 text-sm">Reprise auto après takt</p>
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
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/20">
                      <Volume2 className="h-5 w-5 text-orange-400" />
                    </div>
                    <CardTitle className="text-lg text-slate-100">Alertes sonores</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-700">
                      <span className="text-slate-300 text-xs">Début takt</span>
                      <Switch
                        checked={formData.sound_alerts.takt_start}
                        onCheckedChange={(checked) => updateSoundAlert('takt_start', checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-700">
                      <span className="text-slate-300 text-xs">Fin takt</span>
                      <Switch
                        checked={formData.sound_alerts.takt_end}
                        onCheckedChange={(checked) => updateSoundAlert('takt_end', checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-700">
                      <span className="text-slate-300 text-xs">Début pause</span>
                      <Switch
                        checked={formData.sound_alerts.break_start}
                        onCheckedChange={(checked) => updateSoundAlert('break_start', checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-700">
                      <span className="text-slate-300 text-xs">Fin pause</span>
                      <Switch
                        checked={formData.sound_alerts.break_end}
                        onCheckedChange={(checked) => updateSoundAlert('break_end', checked)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs">Alerte avant fin takt (min)</Label>
                    <div className="flex items-center gap-3">
                      <Slider
                        value={[formData.sound_alerts.minutes_before_takt_end]}
                        onValueChange={([val]) => updateSoundAlert('minutes_before_takt_end', val)}
                        min={1}
                        max={15}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-sm font-mono font-bold text-orange-400 w-12 text-right">
                        {formData.sound_alerts.minutes_before_takt_end}m
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sidebar - 1 column on xl */}
          <div className="space-y-6">
            {/* Estimated Takts */}
            <Card className="bg-slate-800/50 border-slate-700 xl:sticky xl:top-4">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <Calculator className="h-5 w-5 text-green-400" />
                  </div>
                  <CardTitle className="text-lg text-slate-100">Estimation</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <p className="text-5xl font-mono font-bold text-green-400" data-testid="estimated-takts">
                    {estimatedTakts}
                  </p>
                  <p className="text-slate-400 mt-2 text-sm">takts / jour (lundi)</p>
                </div>
                <Separator className="bg-slate-700 my-4" />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-400">
                    <span>Durée takt</span>
                    <span className="font-mono">{formData.takt_duration} min</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Total pauses</span>
                    <span className="font-mono">{formData.breaks.reduce((a, b) => a + b.duration, 0)} min</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <Button 
              type="submit"
              disabled={saving}
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-lg btn-control"
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
