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
- Hiérarchie: Site > Ligne > Écrans TV
- Paramétrage: nom ligne, durée takt (20-40min), horaires par jour, 3 pauses, alertes sonores
- Gestion équipes: 1×8, 2×8, 3×8 avec horaires personnalisés par jour
- Commandes: démarrer, suspendre, arrêter
- Affichage TV: temps écoulé/restant, compteur takts, statut
- Multi-lignes et multi-sites
- Persistance MongoDB commune
- Sans authentification (accès libre)
- Export CSV des événements (1-7 jours)
- Statistiques de performance

## What's Been Implemented ✅
**Date: 2026-03-11**

### Backend (FastAPI) - v2
- API REST complète avec CRUD: Sites, Lignes, Écrans TV
- Endpoints événements et statistiques
- Export CSV avec filtrage par période et ligne
- WebSocket pour mises à jour temps réel
- Calcul automatique du nombre de takts estimés
- Logging automatique des événements (start/pause/stop/next)

### Frontend (React)
- **Dashboard**: Liste des lignes, filtrage par site, boutons Sites/Statistiques
- **Sites Management**: CRUD des sites de production
- **Screens Management**: CRUD des écrans TV avec IP et position
- **Configuration**: Formulaire complet avec horaires par jour (Lun-Dim), équipes
- **Statistics**: Cartes KPI, tableau événements, export CSV
- **Écran TV**: Affichage plein écran grand format
- Design industriel sombre responsive
- Alertes sonores via Web Audio API

### Features Implémentées
- ✅ Hiérarchie Site > Ligne > Écrans TV
- ✅ Multi-sites avec base commune
- ✅ Équipes 1×8/2×8/3×8
- ✅ Horaires personnalisés par jour (vendredi plus court)
- ✅ Configuration des pauses
- ✅ Alertes sonores
- ✅ Historique/logs des événements
- ✅ Statistiques: temps moyen, retards, taux respect
- ✅ Export CSV (période 1-7 jours)
- ✅ Gestion des écrans TV (nom, IP, position)
- ✅ Affichage TV plein écran
- ✅ Contrôles: démarrer/suspendre/arrêter/suivant

## Prioritized Backlog

### P0 - Critical (Implémenté)
- [x] CRUD sites, lignes, écrans TV
- [x] Contrôles takt
- [x] Statistiques et export CSV
- [x] Horaires par jour

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
        └── Écrans TV (Début, Milieu, Fin de ligne)
```

## Next Tasks
1. Implémenter le déclenchement automatique des pauses selon horaires configurés
2. Ajouter mode kiosque/plein écran automatique pour les écrans TV
3. Graphiques de tendances sur la page statistiques
