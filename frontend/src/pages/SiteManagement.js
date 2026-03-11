import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTakt } from '@/context/TaktContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  Building2,
  MapPin,
  Edit,
  Trash2,
  Factory,
} from 'lucide-react';

export default function SiteManagement() {
  const navigate = useNavigate();
  const { sites, fetchSites, createSite, updateSite, deleteSite } = useTakt();
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [siteToDelete, setSiteToDelete] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    description: '',
  });

  useEffect(() => {
    loadSites();
  }, []);

  const loadSites = async () => {
    setLoading(true);
    await fetchSites();
    setLoading(false);
  };

  const handleOpenDialog = (site = null) => {
    if (site) {
      setEditingSite(site);
      setFormData({
        name: site.name,
        location: site.location || '',
        description: site.description || '',
      });
    } else {
      setEditingSite(null);
      setFormData({ name: '', location: '', description: '' });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Le nom du site est requis');
      return;
    }

    try {
      if (editingSite) {
        await updateSite(editingSite.id, formData);
        toast.success('Site mis à jour');
      } else {
        await createSite(formData);
        toast.success('Site créé');
      }
      setDialogOpen(false);
      loadSites();
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async () => {
    if (!siteToDelete) return;
    try {
      await deleteSite(siteToDelete.id);
      toast.success('Site supprimé');
      setDeleteDialogOpen(false);
      setSiteToDelete(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la suppression');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-8" data-testid="site-management">
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
              Gestion des Sites
            </h1>
            <p className="text-slate-400 mt-1">Gérez vos sites de production</p>
          </div>
          <Button 
            onClick={() => handleOpenDialog()}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6"
            data-testid="new-site-btn"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nouveau site
          </Button>
        </div>
      </header>

      {/* Sites Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Chargement...</div>
        </div>
      ) : sites.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-16 w-16 text-slate-600 mb-4" />
            <h3 className="text-xl font-heading text-slate-300 mb-2">Aucun site configuré</h3>
            <p className="text-slate-500 mb-6 text-center max-w-md">
              Créez votre premier site pour organiser vos lignes de production.
            </p>
            <Button 
              onClick={() => handleOpenDialog()}
              className="bg-blue-600 hover:bg-blue-500 text-white"
              data-testid="empty-new-site-btn"
            >
              <Plus className="h-5 w-5 mr-2" />
              Créer un site
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sites.map((site) => (
            <Card 
              key={site.id}
              className="bg-slate-800/50 border-slate-700 card-hover animate-fade-in-up"
              data-testid={`site-card-${site.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20">
                      <Building2 className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-heading text-slate-100">
                        {site.name}
                      </CardTitle>
                      {site.location && (
                        <p className="text-sm text-slate-400 flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {site.location}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {site.description && (
                  <p className="text-sm text-slate-500">{site.description}</p>
                )}
                
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Factory className="h-4 w-4" />
                  <span>{site.line_count || 0} ligne(s) de production</span>
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-700">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="flex-1 text-slate-400 hover:text-slate-100 hover:bg-slate-700"
                    onClick={() => handleOpenDialog(site)}
                    data-testid={`edit-site-${site.id}`}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Modifier
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                    onClick={() => {
                      setSiteToDelete(site);
                      setDeleteDialogOpen(true);
                    }}
                    data-testid={`delete-site-${site.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {editingSite ? 'Modifier le site' : 'Nouveau site'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">Nom du site *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ex: Usine Lyon"
                className="bg-slate-900/50 border-slate-700 text-slate-100"
                data-testid="site-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location" className="text-slate-300">Localisation</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="ex: Lyon, France"
                className="bg-slate-900/50 border-slate-700 text-slate-100"
                data-testid="site-location-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-slate-300">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="ex: Site principal d'assemblage"
                className="bg-slate-900/50 border-slate-700 text-slate-100"
                data-testid="site-description-input"
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
                data-testid="save-site-btn"
              >
                {editingSite ? 'Mettre à jour' : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Supprimer le site ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action supprimera définitivement le site "{siteToDelete?.name}".
              {siteToDelete?.line_count > 0 && (
                <span className="block mt-2 text-yellow-400">
                  Attention: Ce site contient {siteToDelete.line_count} ligne(s). Supprimez-les d'abord.
                </span>
              )}
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
