# Takt Time - Application Industrielle

## Problem Statement
Application industrielle « Takt time » pour cadencer des lignes de production avec:
- Back office pour paramétrer et commander le takt time
- Affichage du compte à rebours sur écrans TV connectés au réseau
- Accès multi-utilisateurs (techniciens) depuis mobile ou PC
- Multi-sites France avec base de données commune

## User Personas
1. **Techniciens de production** - Suspendent/reprennent les takts
2. **Responsables d'atelier** - Configurent les lignes de production
3. **Opérateurs** - Visualisent le temps restant sur écrans TV
4. **Direction** - Consultent les statistiques de performance

## Core Requirements (Static)
- Hiérarchie: Site > Ligne
- Paramétrage: nom ligne, durée takt (20-90min), horaires par jour, pauses dynamiques, alertes sonores
- Gestion équipes: multi-équipes avec horaires personnalisés par équipe
- Commandes: suspendre, reprendre (démarrage manuel optionnel si auto-start désactivé)
- Affichage TV: temps écoulé/restant, compteur takts, statut
- Multi-lignes et multi-sites avec fuseau horaire par site
- Persistance MongoDB commune
- Sans authentification (accès libre)
- Export CSV des événements (1-7 jours)
- Statistiques de performance
- URL TV simple à copier (`/tv/{line_id}`)

## What's Been Implemented ✅
**Date: 2026-03-12**

### Backend (FastAPI) - v2
- API REST complète avec CRUD: Sites, Lignes
- **Fuseau horaire par site** (Europe/Paris par défaut, 15 options)
- **Démarrage automatique intelligent** (`/auto-start-check`, `/auto-start`)
  - Calcule le takt correct et le temps écoulé depuis le début de journée
  - Respecte le fuseau horaire du site
- Endpoints événements et statistiques
- Export CSV avec filtrage par période et ligne
- WebSocket pour mises à jour temps réel
- Calcul automatique du nombre de takts estimés
- Logging automatique des événements

### Frontend (React)
- **Dashboard**: 
  - Liste des lignes, filtrage par site
  - **IDs masqués** (plus visibles pour les utilisateurs)
  - Affichage horaires depuis l'équipe active
  - Bouton "URL" pour copier l'URL TV
  - **Logique auto-start**: si activé → Suspendre/Reprendre seulement
  - **Pas de bouton Stop ni Takt suivant**
- **Sites Management**: 
  - CRUD des sites
  - **Sélecteur de fuseau horaire** (15 options)
  - Affichage du fuseau sur les cartes
- **Configuration Équipes**: 
  - Équipes configurables séparément
  - Slider takt **20-90 minutes**
  - **3 options globales**: Démarrage auto, Reprise auto pause, Passage auto takt
  - Bouton supprimer la ligne
- **Statistics**: Cartes KPI, tableau événements, export CSV
- **Écran TV**: 
  - Affichage plein écran grand format
  - **ID masqué**
  - Horaires depuis l'équipe active
  - Logique auto-start identique au dashboard
- Sons industriels: Beeps/horns adaptés environnement automobile

### Features Implémentées
- ✅ Hiérarchie Site > Ligne
- ✅ **Fuseau horaire par site** (Europe/Paris par défaut)
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
- ✅ Affichage TV plein écran (sans ID)
- ✅ Passage automatique au takt suivant
- ✅ Sons industriels automobiles
- ✅ **Démarrage automatique en début de journée** (calcule le bon takt)
- ✅ **Temps dépassé** affiché seulement si auto-next désactivé
- ✅ **IDs masqués** sur tous les écrans
- ✅ **Suppression des boutons Stop et Takt suivant**

## Prioritized Backlog

### P0 - Critical (Implémenté)
- [x] CRUD sites, lignes
- [x] Contrôles takt
- [x] Statistiques et export CSV
- [x] Horaires par équipe
- [x] Fuseau horaire par site
- [x] Démarrage automatique intelligent

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
Site (Usine Lyon, Paris, etc.) - avec fuseau horaire
  └── Ligne de Production (Ligne A, B, C...)
        └── URL TV: /tv/{line_id}
```

## API Endpoints Clés
- `GET /api/server-time` - Heure serveur (UTC et Paris)
- `GET /api/sites` / `POST /api/sites` - CRUD sites avec timezone
- `GET /api/lines` / `PUT /api/lines/{id}` - CRUD lignes
- `GET /api/lines/{id}/auto-start-check` - Vérifie si auto-start nécessaire
- `POST /api/lines/{id}/auto-start` - Démarre avec le bon takt et temps
- `POST /api/lines/{id}/start` - Démarrer/reprendre
- `POST /api/lines/{id}/pause` - Suspendre
- `GET /api/stats/{id}` - Statistiques

## Next Tasks
1. Implémenter le déclenchement automatique des pauses selon horaires configurés
2. Ajouter mode kiosque automatique pour écrans TV
3. Graphiques de tendances sur la page statistiques

## Technical Notes
- Fuseau horaire stocké au niveau du site (défaut: Europe/Paris)
- Tous les calculs d'auto-start utilisent le fuseau du site
- `auto_start_at_day_begin=true` désactive le bouton Démarrer
- `auto_resume_after_takt=false` permet l'affichage du temps dépassé
- IDs de ligne visibles uniquement dans les URLs (pas dans l'UI)
