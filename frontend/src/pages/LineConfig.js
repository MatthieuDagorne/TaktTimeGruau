import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTakt } from '@/context/TaktContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  Factory,
  Clock,
  Timer,
  Coffee,
  Calculator,
  Volume2,
  Building2,
  Users,
  Plus,
  Edit,
  Trash2,
  Check,
  AlertTriangle,
} from 'lucide-react';

// Utility functions for time validation
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const minutesToTime = (minutes) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const isTimeInRange = (time, start, end) => {
  const t = timeToMinutes(time);
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  
  // Handle overnight shifts (e.g., 22:00 - 06:00)
  if (e < s) {
    return t >= s || t <= e;
  }
  return t >= s && t <= e;
};

const validateTeam = (team) => {
  const errors = [];
  const warnings = [];
  
  const startMin = timeToMinutes(team.day_start);
  const endMin = timeToMinutes(team.day_end);
  
  // Check start/end coherence
  if (startMin === endMin) {
    errors.push("L'heure de début et de fin ne peuvent pas être identiques");
  }
  
  // Calculate working duration (handle overnight)
  let workDuration = endMin - startMin;
  if (workDuration < 0) {
    workDuration += 24 * 60; // Overnight shift
  }
  
  if (workDuration < 60) {
    errors.push("La durée de travail doit être d'au moins 1 heure");
  }
  
  // Validate takt duration
  if (team.takt_duration < 20 || team.takt_duration > 40) {
    errors.push("La durée du takt doit être entre 20 et 40 minutes");
  }
  
  // Validate breaks
  let totalBreakDuration = 0;
  team.breaks.forEach((brk, index) => {
    const breakNum = index + 1;
    
    if (brk.duration < 0) {
      errors.push(`Pause ${breakNum}: la durée ne peut pas être négative`);
    }
    
    if (brk.duration > 120) {
      warnings.push(`Pause ${breakNum}: durée supérieure à 2 heures`);
    }
    
    if (brk.start_time) {
      const breakStart = timeToMinutes(brk.start_time);
      const breakEnd = breakStart + brk.duration;
      
      // Check if break is within working hours
      if (!isTimeInRange(brk.start_time, team.day_start, team.day_end)) {
        errors.push(`Pause ${breakNum}: l'heure de début (${brk.start_time}) est en dehors des heures de travail`);
      }
      
      // Check if break end is within working hours
      const breakEndTime = minutesToTime(breakEnd);
      if (brk.duration > 0 && !isTimeInRange(breakEndTime, team.day_start, team.day_end)) {
        warnings.push(`Pause ${breakNum}: se termine après la fin du travail`);
      }
    }
    
    totalBreakDuration += brk.duration || 0;
  });
  
  // Check if breaks don't exceed work time
  if (totalBreakDuration >= workDuration) {
    errors.push("Le temps total des pauses dépasse ou égale le temps de travail");
  }
  
  // Check if there's enough time for at least one takt
  const netWorkTime = workDuration - totalBreakDuration;
  if (netWorkTime < team.takt_duration) {
    errors.push("Le temps de travail net est insuffisant pour un seul takt");
  }
  
  return { errors, warnings, isValid: errors.length === 0 };
};

const defaultTeam = {
  name: '',
  day_start: '08:00',
  day_end: '17:00',
  takt_duration: 30,
  breaks: [], // Start with no breaks, user adds as needed
  sound_alerts: {
    takt_start: true,
    minutes_before_takt_end: 5,
    takt_end: true,
    break_start: true,
    minutes_before_break_end: 5,
    break_end: true,
  },
  is_active: true,
};

const createDefaultBreak = (index) => ({
  name: `Pause ${index + 1}`,
  start_time: '',
  duration: 15,
});

export default function LineConfig() {
  const { lineId } = useParams();
  const navigate = useNavigate();
  const { sites, fetchSites, fetchLine, createLine, updateLine } = useTakt();
  const isNew = !lineId || lineId === 'new';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingTeamIndex, setEditingTeamIndex] = useState(-1);
  const [teamValidation, setTeamValidation] = useState({ errors: [], warnings: [], isValid: true });

  const [formData, setFormData] = useState({
    name: '',
    site_id: '',
    takt_duration: 30,
    shift_organization: {
      type: '1x8',
      teams: [
        {
          id: crypto.randomUUID(),
          name: 'Équipe Standard',
          day_start: '08:00',
          day_end: '17:00',
          takt_duration: 30,
          breaks: [
            { name: 'Pause 1', start_time: '10:00', duration: 15 },
            { name: 'Pause 2', start_time: '12:00', duration: 60 },
          ],
          sound_alerts: {
            takt_start: true,
            minutes_before_takt_end: 5,
            takt_end: true,
            break_start: true,
            minutes_before_break_end: 5,
            break_end: true,
          },
          is_active: true,
        },
      ],
      active_team_id: null,
    },
    auto_resume_after_break: true,
    auto_resume_after_takt: true,
  });

  useEffect(() => {
    fetchSites();
    if (!isNew && lineId) {
      setLoading(true);
      loadLine();
    }
  }, [lineId, isNew, fetchSites]);

  // Validate editing team when it changes
  useEffect(() => {
    if (editingTeam) {
      setTeamValidation(validateTeam(editingTeam));
    }
  }, [editingTeam]);

  const loadLine = async () => {
    try {
      const data = await fetchLine(lineId);
      
      let shiftOrg = data.shift_organization;
      if (!shiftOrg || !shiftOrg.teams || shiftOrg.teams.length === 0) {
        // Convert legacy format - rename breaks to Pause 1, 2, 3
        const legacyBreaks = (data.breaks || []).map((b, i) => ({
          name: `Pause ${i + 1}`,
          start_time: b.start_time || '',
          duration: b.duration || 0,
        }));
        
        shiftOrg = {
          type: data.team_config?.shift_type || '1x8',
          teams: [{
            id: crypto.randomUUID(),
            name: data.team_config?.name || 'Équipe Standard',
            day_start: data.team_config?.weekly_schedule?.monday?.day_start || '08:00',
            day_end: data.team_config?.weekly_schedule?.monday?.day_end || '17:00',
            takt_duration: data.takt_duration || 30,
            breaks: legacyBreaks,
            sound_alerts: data.sound_alerts || defaultTeam.sound_alerts,
            is_active: true,
          }],
          active_team_id: null,
        };
      } else {
        // Ensure breaks have proper names
        shiftOrg.teams = shiftOrg.teams.map(team => ({
          ...team,
          breaks: (team.breaks || []).map((b, i) => ({
            ...b,
            name: `Pause ${i + 1}`,
          })),
        }));
      }

      setFormData({
        name: data.name || '',
        site_id: data.site_id || '',
        takt_duration: data.takt_duration || 30,
        shift_organization: shiftOrg,
        auto_resume_after_break: data.auto_resume_after_break ?? true,
        auto_resume_after_takt: data.auto_resume_after_takt ?? true,
      });
    } catch (err) {
      toast.error('Erreur lors du chargement de la ligne');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const calculateTeamTakts = useCallback((team) => {
    try {
      const startMin = timeToMinutes(team.day_start);
      const endMin = timeToMinutes(team.day_end);
      
      let totalMinutes = endMin - startMin;
      if (totalMinutes < 0) {
        totalMinutes += 24 * 60; // Overnight shift
      }
      
      (team.breaks || []).forEach(b => {
        if (b.duration > 0) {
          totalMinutes -= b.duration;
        }
      });

      const takts = Math.floor(totalMinutes / (team.takt_duration || 30));
      return Math.max(0, takts);
    } catch {
      return 0;
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Le nom de la ligne est requis');
      return;
    }

    if (formData.shift_organization.teams.length === 0) {
      toast.error('Au moins une équipe est requise');
      return;
    }

    // Validate all teams before saving
    for (const team of formData.shift_organization.teams) {
      const validation = validateTeam(team);
      if (!validation.isValid) {
        toast.error(`Équipe "${team.name}": ${validation.errors[0]}`);
        return;
      }
    }

    setSaving(true);
    try {
      const dataToSave = { ...formData };
      if (!dataToSave.shift_organization.active_team_id) {
        dataToSave.shift_organization.active_team_id = dataToSave.shift_organization.teams[0]?.id;
      }
      dataToSave.takt_duration = dataToSave.shift_organization.teams[0]?.takt_duration || 30;

      if (isNew) {
        await createLine(dataToSave);
        toast.success('Ligne créée avec succès');
      } else {
        await updateLine(lineId, dataToSave);
        toast.success('Ligne mise à jour avec succès');
      }
      navigate('/');
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleShiftTypeChange = (type) => {
    const currentTeams = formData.shift_organization.teams;
    let newTeams = [...currentTeams];

    const createTeamForShift = (index, shiftType) => {
      const configs = {
        '1x8': [{ name: 'Équipe Standard', start: '08:00', end: '17:00' }],
        '2x8': [
          { name: 'Équipe Matin', start: '06:00', end: '14:00' },
          { name: 'Équipe Après-midi', start: '14:00', end: '22:00' },
        ],
        '3x8': [
          { name: 'Équipe Matin', start: '06:00', end: '14:00' },
          { name: 'Équipe Après-midi', start: '14:00', end: '22:00' },
          { name: 'Équipe Nuit', start: '22:00', end: '06:00' },
        ],
      };
      const config = configs[shiftType]?.[index] || configs['1x8'][0];
      return {
        ...defaultTeam,
        id: crypto.randomUUID(),
        name: config.name,
        day_start: config.start,
        day_end: config.end,
        breaks: [createDefaultBreak(0)], // One default break
      };
    };

    if (type === '1x8') {
      newTeams = [newTeams[0] || createTeamForShift(0, '1x8')];
    } else if (type === '2x8') {
      while (newTeams.length < 2) {
        newTeams.push(createTeamForShift(newTeams.length, '2x8'));
      }
      if (newTeams.length > 2) newTeams = newTeams.slice(0, 2);
    } else if (type === '3x8') {
      while (newTeams.length < 3) {
        newTeams.push(createTeamForShift(newTeams.length, '3x8'));
      }
      if (newTeams.length > 3) newTeams = newTeams.slice(0, 3);
    }

    setFormData(prev => ({
      ...prev,
      shift_organization: {
        ...prev.shift_organization,
        type,
        teams: newTeams,
      },
    }));
  };

  const openTeamDialog = (team = null, index = -1) => {
    if (team) {
      // Ensure breaks have proper names
      const teamWithNamedBreaks = {
        ...team,
        breaks: (team.breaks || []).map((b, i) => ({
          ...b,
          name: `Pause ${i + 1}`,
        })),
      };
      setEditingTeam(teamWithNamedBreaks);
      setEditingTeamIndex(index);
    } else {
      setEditingTeam({
        ...defaultTeam,
        id: crypto.randomUUID(),
        name: `Équipe ${formData.shift_organization.teams.length + 1}`,
        breaks: [createDefaultBreak(0)],
      });
      setEditingTeamIndex(-1);
    }
    setTeamDialogOpen(true);
  };

  const saveTeam = () => {
    if (!editingTeam.name.trim()) {
      toast.error("Le nom de l'équipe est requis");
      return;
    }

    const validation = validateTeam(editingTeam);
    if (!validation.isValid) {
      toast.error(validation.errors[0]);
      return;
    }

    // Renumber breaks before saving
    const teamToSave = {
      ...editingTeam,
      breaks: editingTeam.breaks.map((b, i) => ({
        ...b,
        name: `Pause ${i + 1}`,
      })),
    };

    const newTeams = [...formData.shift_organization.teams];
    if (editingTeamIndex >= 0) {
      newTeams[editingTeamIndex] = teamToSave;
    } else {
      newTeams.push(teamToSave);
    }

    setFormData(prev => ({
      ...prev,
      shift_organization: {
        ...prev.shift_organization,
        teams: newTeams,
      },
    }));
    setTeamDialogOpen(false);
    setEditingTeam(null);
    toast.success(editingTeamIndex >= 0 ? 'Équipe modifiée' : 'Équipe ajoutée');
  };

  const deleteTeam = (index) => {
    if (formData.shift_organization.teams.length <= 1) {
      toast.error('Au moins une équipe est requise');
      return;
    }
    const newTeams = formData.shift_organization.teams.filter((_, i) => i !== index);
    setFormData(prev => ({
      ...prev,
      shift_organization: {
        ...prev.shift_organization,
        teams: newTeams,
      },
    }));
    toast.success('Équipe supprimée');
  };

  const setActiveTeam = (teamId) => {
    setFormData(prev => ({
      ...prev,
      shift_organization: {
        ...prev.shift_organization,
        active_team_id: teamId,
      },
    }));
  };

  // Break management functions
  const addBreak = () => {
    if (!editingTeam) return;
    const newBreaks = [...editingTeam.breaks, createDefaultBreak(editingTeam.breaks.length)];
    setEditingTeam({ ...editingTeam, breaks: newBreaks });
  };

  const removeBreak = (index) => {
    if (!editingTeam) return;
    const newBreaks = editingTeam.breaks.filter((_, i) => i !== index);
    // Renumber remaining breaks
    const renamedBreaks = newBreaks.map((b, i) => ({
      ...b,
      name: `Pause ${i + 1}`,
    }));
    setEditingTeam({ ...editingTeam, breaks: renamedBreaks });
  };

  const updateEditingTeamBreak = (index, field, value) => {
    const newBreaks = [...editingTeam.breaks];
    newBreaks[index] = { ...newBreaks[index], [field]: value };
    setEditingTeam({ ...editingTeam, breaks: newBreaks });
  };

  const updateEditingTeamSound = (field, value) => {
    setEditingTeam({
      ...editingTeam,
      sound_alerts: { ...editingTeam.sound_alerts, [field]: value },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Chargement...</div>
      </div>
    );
  }

  const totalEstimatedTakts = formData.shift_organization.teams.reduce(
    (sum, team) => sum + calculateTeamTakts(team), 0
  );

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
          {/* Main Config - 3 columns */}
          <div className="xl:col-span-3 space-y-6">
            {/* Basic Info */}
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
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            {/* Shift Organization */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20">
                      <Users className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-slate-100">Organisation des équipes</CardTitle>
                      <CardDescription className="text-slate-400">
                        Configurez les équipes et leurs horaires
                      </CardDescription>
                    </div>
                  </div>
                  <Select 
                    value={formData.shift_organization.type}
                    onValueChange={handleShiftTypeChange}
                  >
                    <SelectTrigger className="w-[140px] bg-slate-900/50 border-slate-700 text-slate-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="1x8">1×8 (1 équipe)</SelectItem>
                      <SelectItem value="2x8">2×8 (2 équipes)</SelectItem>
                      <SelectItem value="3x8">3×8 (3 équipes)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Teams List */}
                <div className="space-y-3">
                  {formData.shift_organization.teams.map((team, index) => (
                    <div 
                      key={team.id} 
                      className={`p-4 rounded-lg border transition-all ${
                        formData.shift_organization.active_team_id === team.id
                          ? 'bg-green-500/10 border-green-500/50'
                          : 'bg-slate-900/50 border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium text-slate-100">{team.name}</h4>
                          {formData.shift_organization.active_team_id === team.id && (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {formData.shift_organization.active_team_id !== team.id && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setActiveTeam(team.id)}
                              className="text-green-400 hover:text-green-300 hover:bg-green-500/20 h-8"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Activer
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openTeamDialog(team, index)}
                            className="text-slate-400 hover:text-slate-100 h-8"
                            data-testid={`edit-team-${index}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {formData.shift_organization.teams.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteTeam(index)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-8"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Clock className="h-4 w-4" />
                          <span>{team.day_start} - {team.day_end}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <Timer className="h-4 w-4" />
                          <span>{team.takt_duration} min/takt</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <Coffee className="h-4 w-4" />
                          <span>{team.breaks?.length || 0} pause(s)</span>
                        </div>
                        <div className="flex items-center gap-2 text-cyan-400">
                          <Calculator className="h-4 w-4" />
                          <span>{calculateTeamTakts(team)} takts/jour</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Team Button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openTeamDialog()}
                  className="w-full border-dashed border-slate-600 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter une équipe
                </Button>
              </CardContent>
            </Card>

            {/* Global Options */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg text-slate-100">Options globales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/50 border border-slate-700">
                    <div>
                      <p className="font-medium text-slate-300">Reprise auto après pause</p>
                      <p className="text-xs text-slate-500 mt-1">Le takt reprend après les pauses</p>
                    </div>
                    <Switch
                      checked={formData.auto_resume_after_break}
                      onCheckedChange={(checked) => setFormData({ ...formData, auto_resume_after_break: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/50 border border-slate-700">
                    <div>
                      <p className="font-medium text-slate-300">Passage auto au takt suivant</p>
                      <p className="text-xs text-slate-500 mt-1">Enchaîne automatiquement les takts</p>
                    </div>
                    <Switch
                      checked={formData.auto_resume_after_takt}
                      onCheckedChange={(checked) => setFormData({ ...formData, auto_resume_after_takt: checked })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="bg-slate-800/50 border-slate-700 xl:sticky xl:top-4">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <Calculator className="h-5 w-5 text-green-400" />
                  </div>
                  <CardTitle className="text-lg text-slate-100">Estimation totale</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <p className="text-5xl font-mono font-bold text-green-400" data-testid="estimated-takts">
                    {totalEstimatedTakts}
                  </p>
                  <p className="text-slate-400 mt-2 text-sm">takts / jour (toutes équipes)</p>
                </div>
                <Separator className="bg-slate-700 my-4" />
                <div className="space-y-2 text-sm">
                  {formData.shift_organization.teams.map(team => (
                    <div key={team.id} className="flex justify-between text-slate-400">
                      <span className="truncate mr-2">{team.name}</span>
                      <span className="font-mono">{calculateTeamTakts(team)} takts</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button 
              type="submit"
              disabled={saving}
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-lg"
              data-testid="save-btn"
            >
              <Save className="h-5 w-5 mr-2" />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </form>

      {/* Team Edit Dialog */}
      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {editingTeamIndex >= 0 ? "Modifier l'équipe" : 'Nouvelle équipe'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Configurez les horaires, pauses et alertes de l'équipe
            </DialogDescription>
          </DialogHeader>
          
          {editingTeam && (
            <div className="space-y-6">
              {/* Validation Errors */}
              {teamValidation.errors.length > 0 && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc list-inside text-sm">
                      {teamValidation.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              
              {teamValidation.warnings.length > 0 && (
                <Alert className="bg-yellow-500/10 border-yellow-500/50">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <AlertDescription className="text-yellow-200">
                    <ul className="list-disc list-inside text-sm">
                      {teamValidation.warnings.map((warn, i) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Team Name & Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Nom de l'équipe *</Label>
                  <Input
                    value={editingTeam.name}
                    onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })}
                    placeholder="ex: Équipe Matin"
                    className="bg-slate-900/50 border-slate-700 text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Heure début</Label>
                  <Input
                    type="time"
                    value={editingTeam.day_start}
                    onChange={(e) => setEditingTeam({ ...editingTeam, day_start: e.target.value })}
                    className="bg-slate-900/50 border-slate-700 text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Heure fin</Label>
                  <Input
                    type="time"
                    value={editingTeam.day_end}
                    onChange={(e) => setEditingTeam({ ...editingTeam, day_end: e.target.value })}
                    className="bg-slate-900/50 border-slate-700 text-slate-100"
                  />
                </div>
              </div>

              {/* Takt Duration */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-green-400" />
                  <Label className="text-slate-300">Durée du Takt (20-40 min)</Label>
                </div>
                <Slider
                  value={[editingTeam.takt_duration]}
                  onValueChange={([val]) => setEditingTeam({ ...editingTeam, takt_duration: val })}
                  min={20}
                  max={40}
                  step={1}
                />
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">20 min</span>
                  <span className="text-xl font-mono font-bold text-green-400">{editingTeam.takt_duration} min</span>
                  <span className="text-slate-500">40 min</span>
                </div>
              </div>

              <Separator className="bg-slate-700" />

              {/* Breaks - Dynamic list */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-yellow-400" />
                    <Label className="text-slate-300">Pauses ({editingTeam.breaks.length})</Label>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addBreak}
                    className="h-8 border-slate-600 text-slate-300"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Ajouter
                  </Button>
                </div>
                
                {editingTeam.breaks.length === 0 ? (
                  <p className="text-center text-slate-500 py-4 text-sm">
                    Aucune pause configurée. Cliquez sur "Ajouter" pour en créer une.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {editingTeam.breaks.map((brk, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                        <span className="text-slate-400 font-medium text-sm w-16">
                          Pause {index + 1}
                        </span>
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">Heure</Label>
                            <Input
                              type="time"
                              value={brk.start_time}
                              onChange={(e) => updateEditingTeamBreak(index, 'start_time', e.target.value)}
                              className="bg-slate-800 border-slate-600 text-slate-100 h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">Durée (min)</Label>
                            <Input
                              type="number"
                              min={0}
                              max={120}
                              value={brk.duration}
                              onChange={(e) => updateEditingTeamBreak(index, 'duration', parseInt(e.target.value) || 0)}
                              className="bg-slate-800 border-slate-600 text-slate-100 h-9"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBreak(index)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-9 px-2"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator className="bg-slate-700" />

              {/* Sound Alerts */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-orange-400" />
                  <Label className="text-slate-300">Alertes sonores</Label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <span className="text-sm text-slate-300">Début takt</span>
                    <Switch
                      checked={editingTeam.sound_alerts.takt_start}
                      onCheckedChange={(checked) => updateEditingTeamSound('takt_start', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <span className="text-sm text-slate-300">Fin takt</span>
                    <Switch
                      checked={editingTeam.sound_alerts.takt_end}
                      onCheckedChange={(checked) => updateEditingTeamSound('takt_end', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <span className="text-sm text-slate-300">Début pause</span>
                    <Switch
                      checked={editingTeam.sound_alerts.break_start}
                      onCheckedChange={(checked) => updateEditingTeamSound('break_start', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <span className="text-sm text-slate-300">Fin pause</span>
                    <Switch
                      checked={editingTeam.sound_alerts.break_end}
                      onCheckedChange={(checked) => updateEditingTeamSound('break_end', checked)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2 p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <Label className="text-xs text-slate-400">Alerte avant fin takt</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[editingTeam.sound_alerts.minutes_before_takt_end]}
                        onValueChange={([val]) => updateEditingTeamSound('minutes_before_takt_end', val)}
                        min={1}
                        max={15}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-sm font-mono text-orange-400 w-12 text-right">
                        {editingTeam.sound_alerts.minutes_before_takt_end} min
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2 p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <Label className="text-xs text-slate-400">Alerte avant fin pause</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[editingTeam.sound_alerts.minutes_before_break_end]}
                        onValueChange={([val]) => updateEditingTeamSound('minutes_before_break_end', val)}
                        min={1}
                        max={15}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-sm font-mono text-orange-400 w-12 text-right">
                        {editingTeam.sound_alerts.minutes_before_break_end} min
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Estimated Takts for this team */}
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Takts estimés pour cette équipe</span>
                  <span className="text-2xl font-mono font-bold text-green-400">
                    {calculateTeamTakts(editingTeam)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button 
              type="button" 
              variant="outline"
              onClick={() => setTeamDialogOpen(false)}
              className="border-slate-600 text-slate-300"
            >
              Annuler
            </Button>
            <Button 
              onClick={saveTeam}
              disabled={!teamValidation.isValid}
              className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              {editingTeamIndex >= 0 ? 'Mettre à jour' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
