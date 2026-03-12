# Takt Time - Application Industrielle

## Problem Statement
Application industrielle « Takt time » pour cadencer des lignes de production avec:
- Back office pour paramétrer et commander le takt time
- Affichage du compte à rebours sur écrans TV connectés au réseau
- Accès multi-utilisateurs (techniciens) depuis mobile ou PC
- Multi-sites France avec base de données commune

## User Personas
1. **Techniciens de production** - Démarrent/suspendent/arrêtent les takts
2. **Responsables d'atelier** - Configurent les lignes de production
3. **Opérateurs** - Visualisent le temps restant sur écrans TV
4. **Direction** - Consultent les statistiques de performance

## Core Requirements (Static)
- Hiérarchie: Site > Ligne
- Paramétrage: nom ligne, durée takt (20-90min), horaires par jour, pauses dynamiques, alertes sonores
- Gestion équipes: multi-équipes avec horaires personnalisés par équipe
- Commandes: démarrer (optionnel), suspendre, reprendre
- Affichage TV: temps écoulé/restant, compteur takts, statut
- Multi-lignes et multi-sites
- Persistance MongoDB commune
- Sans authentification (accès libre)
- Export CSV des événements (1-7 jours)
- Statistiques de performance
- URL TV simple à copier (pas de gestion d'écrans complexe)

## What's Been Implemented ✅
**Date: 2026-03-12 (Mise à jour)**

### Backend (FastAPI) - v2
- API REST complète avec CRUD: Sites, Lignes
- Endpoints événements et statistiques
- Export CSV avec filtrage par période et ligne
- WebSocket pour mises à jour temps réel
- Calcul automatique du nombre de takts estimés
- Logging automatique des événements (start/pause/stop/next)
- **Fuseau horaire Paris** (Europe/Paris) pour déterminer le jour actuel
- **Champ auto_start_at_day_begin** pour démarrage automatique

### Frontend (React)
- **Dashboard**: 
  - Liste des lignes, filtrage par site
  - Boutons Sites/Statistiques
  - Affichage horaires depuis l'équipe active
  - Bouton "URL" pour copier l'URL TV
  - **Pas de bouton Stop ni Takt suivant**
  - **Logique conditionnelle**: si auto-start activé → Suspendre/Reprendre seulement
- **Sites Management**: CRUD des sites de production
- **Configuration Équipes**: 
  - Équipes configurables séparément
  - Chaque équipe a ses propres: horaires, durée takt, pauses, alertes sonores
  - Dialogue d'édition complet avec tous les paramètres
  - **Slider takt 20-90 minutes**
  - **3 options globales**: 
    1. Démarrage auto en début de journée
    2. Reprise auto après pause
    3. Passage auto au takt suivant (pas de temps dépassé)
  - **Bouton supprimer la ligne**
- **Statistics**: Cartes KPI, tableau événements, export CSV
- **Écran TV**: 
  - Affichage plein écran grand format
  - Horaires depuis l'équipe active
  - **Pas de bouton Stop ni Next**
  - **Logique conditionnelle** comme le dashboard
- **Sons industriels**: Beeps/horns adaptés environnement automobile
- Design industriel sombre responsive

### Features Implémentées
- ✅ Hiérarchie Site > Ligne
- ✅ Multi-sites avec base commune
- ✅ Multi-équipes avec configurations séparées
- ✅ Horaires overnight supportés (ex: 22:00 - 06:00)
- ✅ **Durée takt configurable 20-90 min**
- ✅ Pauses dynamiques (ajout/suppression)
- ✅ Alertes sonores par équipe
- ✅ Validation des incohérences
- ✅ Historique/logs des événements
- ✅ Statistiques: temps moyen, retards, taux respect
- ✅ Export CSV (période 1-7 jours)
- ✅ **URL TV simple à copier**
- ✅ Affichage TV plein écran
- ✅ Passage automatique au takt suivant
- ✅ Sons industriels automobiles
- ✅ Bug fix: temps conservé pause/reprise
- ✅ **Démarrage automatique en début de journée** (option)
- ✅ **Temps dépassé affiché seulement si auto-next désactivé**
- ✅ **Suppression du bouton Stop/Réinitialiser**
- ✅ **Suppression du bouton Takt suivant**
- ✅ **Fuseau horaire Europe/Paris**

## Prioritized Backlog

### P0 - Critical (Implémenté)
- [x] CRUD sites, lignes
- [x] Contrôles takt
- [x] Statistiques et export CSV
- [x] Horaires par équipe

### P1 - High Priority
- [ ] Gestion automatique des pauses programmées (déclenchement auto)
- [ ] Mode kiosque automatique pour écrans TV (fullscreen F11)
- [ ] Notifications push/alertes sur mobile

### P2 - Medium Priority
- [ ] Graphiques tendances (évolution dans le temps)
- [ ] Comparaison inter-sites
- [ ] Rapports PDF automatiques

## Architecture
```
Site (Usine Lyon, Paris, etc.)
  └── Ligne de Production (Ligne A, B, C...)
        └── URL TV: /tv/{line_id}
```

## Next Tasks
1. Implémenter le déclenchement automatique des pauses selon horaires configurés
2. Ajouter mode kiosque/plein écran automatique pour les écrans TV
3. Graphiques de tendances sur la page statistiques

## Technical Notes
- Fuseau horaire: Europe/Paris pour tous les calculs de jour
- Les horaires sont stockés en UTC mais affichés/calculés en heure locale Paris
- L'option auto_start_at_day_begin désactive le bouton Démarrer sur le dashboard
- L'option auto_resume_after_takt contrôle l'affichage du temps dépassé (si false = temps dépassé visible)
