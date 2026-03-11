import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTakt } from '@/context/TaktContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  Tv,
  Wifi,
  WifiOff,
  Edit,
  Trash2,
  ExternalLink,
  MapPin,
} from 'lucide-react';

export default function ScreenManagement() {
  const { lineId } = useParams();
  const navigate = useNavigate();
  const { fetchLine, fetchScreens, screens, createScreen, updateScreen, deleteScreen, pingScreen } = useTakt();
  const [line, setLine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingScreen, setEditingScreen] = useState(null);
  const [screenToDelete, setScreenToDelete] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    position: '',
    is_active: true,
  });

  useEffect(() => {
    loadData();
  }, [lineId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const lineData = await fetchLine(lineId);
      setLine(lineData);
      await fetchScreens(lineId);
    } catch (err) {
      toast.error('Erreur lors du chargement');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (screen = null) => {
    if (screen) {
      setEditingScreen(screen);
      setFormData({
        name: screen.name,
        ip_address: screen.ip_address || '',
        position: screen.position || '',
        is_active: screen.is_active ?? true,
      });
    } else {
      setEditingScreen(null);
      setFormData({ name: '', ip_address: '', position: '', is_active: true });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Le nom de l\'écran est requis');
      return;
    }
    if (!formData.ip_address.trim()) {
      toast.error('L\'adresse IP est requise');
      return;
    }

    try {
      const screenData = { ...formData, line_id: lineId };
      if (editingScreen) {
        await updateScreen(editingScreen.id, screenData);
        toast.success('Écran mis à jour');
      } else {
        await createScreen(screenData);
        toast.success('Écran ajouté');
      }
      setDialogOpen(false);
      await fetchScreens(lineId);
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async () => {
    if (!screenToDelete) return;
    try {
      await deleteScreen(screenToDelete.id);
      toast.success('Écran supprimé');
      setDeleteDialogOpen(false);
      setScreenToDelete(null);
    } catch (err) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handlePing = async (screen) => {
    try {
      await pingScreen(screen.id);
      toast.success(`Ping envoyé à ${screen.name}`);
      await fetchScreens(lineId);
    } catch (err) {
      toast.error('Échec du ping');
    }
  };

  const openTVDisplay = (screenId) => {
    window.open(`/tv/${lineId}?screen=${screenId}`, '_blank');
  };

  const openAllScreens = () => {
    window.open(`/tv/${lineId}`, '_blank');
  };

  const lineScreens = screens.filter(s => s.line_id === lineId);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-8" data-testid="screen-management">
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-slate-100 tracking-tight">
              Écrans TV - {line?.name}
            </h1>
            <p className="text-slate-400 mt-1">Gérez les écrans d'affichage de cette ligne</p>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={openAllScreens}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              data-testid="open-all-screens-btn"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Ouvrir affichage TV
            </Button>
            <Button 
              onClick={() => handleOpenDialog()}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6"
              data-testid="new-screen-btn"
            >
              <Plus className="h-5 w-5 mr-2" />
              Ajouter un écran
            </Button>
          </div>
        </div>
      </header>

      {/* Screens Grid */}
      {lineScreens.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Tv className="h-16 w-16 text-slate-600 mb-4" />
            <h3 className="text-xl font-heading text-slate-300 mb-2">Aucun écran configuré</h3>
            <p className="text-slate-500 mb-6 text-center max-w-md">
              Ajoutez des écrans TV pour afficher le Takt Time dans l'atelier.
            </p>
            <Button 
              onClick={() => handleOpenDialog()}
              className="bg-blue-600 hover:bg-blue-500 text-white"
              data-testid="empty-new-screen-btn"
            >
              <Plus className="h-5 w-5 mr-2" />
              Ajouter un écran
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lineScreens.map((screen) => {
            const lastPing = screen.last_ping ? new Date(screen.last_ping) : null;
            const isOnline = lastPing && (Date.now() - lastPing.getTime()) < 60000; // 1 min
            
            return (
              <Card 
                key={screen.id}
                className="bg-slate-800/50 border-slate-700 card-hover animate-fade-in-up"
                data-testid={`screen-card-${screen.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${screen.is_active ? 'bg-cyan-500/20' : 'bg-slate-600/20'}`}>
                        <Tv className={`h-5 w-5 ${screen.is_active ? 'text-cyan-400' : 'text-slate-500'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-heading text-slate-100">
                          {screen.name}
                        </CardTitle>
                        <p className="text-sm text-slate-400 font-mono">{screen.ip_address}</p>
                      </div>
                    </div>
                    <Badge 
                      variant="outline"
                      className={isOnline 
                        ? 'bg-green-500/20 text-green-400 border-green-500' 
                        : 'bg-slate-600/20 text-slate-400 border-slate-500'
                      }
                    >
                      {isOnline ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                      {isOnline ? 'En ligne' : 'Hors ligne'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {screen.position && (
                    <p className="text-sm text-slate-400 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Position: {screen.position}
                    </p>
                  )}
                  
                  {lastPing && (
                    <p className="text-xs text-slate-500">
                      Dernier ping: {lastPing.toLocaleString('fr-FR')}
                    </p>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-slate-700">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="flex-1 text-slate-400 hover:text-slate-100 hover:bg-slate-700"
                      onClick={() => handleOpenDialog(screen)}
                      data-testid={`edit-screen-${screen.id}`}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Modifier
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20"
                      onClick={() => openTVDisplay(screen.id)}
                      data-testid={`open-screen-${screen.id}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                      onClick={() => {
                        setScreenToDelete(screen);
                        setDeleteDialogOpen(true);
                      }}
                      data-testid={`delete-screen-${screen.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {editingScreen ? 'Modifier l\'écran' : 'Ajouter un écran TV'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">Nom de l'écran *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ex: Écran Début de Ligne"
                className="bg-slate-900/50 border-slate-700 text-slate-100"
                data-testid="screen-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ip_address" className="text-slate-300">Adresse IP *</Label>
              <Input
                id="ip_address"
                value={formData.ip_address}
                onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                placeholder="ex: 192.168.1.100"
                className="bg-slate-900/50 border-slate-700 text-slate-100 font-mono"
                data-testid="screen-ip-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position" className="text-slate-300">Position sur la ligne</Label>
              <Select 
                value={formData.position} 
                onValueChange={(val) => setFormData({ ...formData, position: val })}
              >
                <SelectTrigger className="bg-slate-900/50 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Sélectionner une position" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="debut">Début de ligne</SelectItem>
                  <SelectItem value="milieu">Milieu de ligne</SelectItem>
                  <SelectItem value="fin">Fin de ligne</SelectItem>
                  <SelectItem value="poste1">Poste 1</SelectItem>
                  <SelectItem value="poste2">Poste 2</SelectItem>
                  <SelectItem value="poste3">Poste 3</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
              <div>
                <p className="font-medium text-slate-300">Écran actif</p>
                <p className="text-sm text-slate-500">L'écran reçoit les mises à jour</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                data-testid="screen-active-switch"
              />
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="border-slate-600 text-slate-300"
              >
                Annuler
              </Button>
              <Button 
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white"
                data-testid="save-screen-btn"
              >
                {editingScreen ? 'Mettre à jour' : 'Ajouter'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Supprimer l'écran ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action supprimera définitivement l'écran "{screenToDelete?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
