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
- Gestion équipes: multi-équipes avec horaires et durée de takt personnalisés
- Commandes: suspendre, reprendre, takt suivant (en overtime)
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
- **Calcul estimatedTakts utilise la durée de l'équipe active**
- Endpoints événements et statistiques
- Export CSV avec filtrage par période et ligne
- WebSocket pour mises à jour temps réel
- Logging automatique des événements
- **Mode de déclenchement des pauses** (trigger_mode: immediate/end_of_takt)
- **Report automatique (carryover)** du temps restant d'un takt non terminé au jour suivant

### Frontend (React)
- **Dashboard**: 
  - Liste des lignes, filtrage par site
  - **Durée du takt et compteur depuis l'équipe active**
  - **Bouton "Takt suivant"** uniquement visible en overtime + auto-next désactivé
  - Bouton "URL" pour copier l'URL TV
  - **Démarrage auto vérifié toutes les 30s** (pas seulement au refresh)
  - Logique auto-start: si activé → Suspendre/Reprendre seulement
  - **Compte à rebours de pause** avec nom de la pause
  - Pas de bouton Stop
- **Sites Management**: 
  - CRUD des sites
  - **Sélecteur de fuseau horaire** (15 options)
- **Configuration Équipes**: 
  - Équipes configurables avec durée takt propre
  - **Mode de déclenchement par pause** (Immédiat / Fin du takt en cours)
  - Slider takt **20-90 minutes**
  - 3 options globales: Démarrage auto, Reprise auto pause, Passage auto takt
  - **Alertes sonores au niveau global** (pas par équipe)
  - Bouton supprimer la ligne
- **Statistics**: Cartes KPI, tableau événements, export CSV
- **Écran TV**: 
  - Affichage plein écran grand format
  - **Compte à rebours de pause** avec nom affiché en grand
  - **Démarrage auto vérifié toutes les 30s** (pas seulement au refresh)
  - **Reprise automatique après pause** fonctionnelle
  - **Bouton "Takt suivant"** en orange (uniquement overtime + auto-next désactivé)
  - Horaires depuis l'équipe active
  - Logique conditionnelle comme le dashboard
- Sons industriels: Beeps/horns adaptés environnement automobile

### Features Implémentées
- ✅ Hiérarchie Site > Ligne
- ✅ **Fuseau horaire par site** (Europe/Paris par défaut)
- ✅ Multi-sites avec base commune
- ✅ Multi-équipes avec **durée de takt propre par équipe**
- ✅ **Affichage dynamique durée et compteur depuis équipe active**
- ✅ Horaires overnight supportés (ex: 22:00 - 06:00)
- ✅ **Durée takt configurable 20-90 min**
- ✅ Pauses dynamiques avec **mode de déclenchement** (immédiat / fin du takt)
- ✅ **Alertes sonores globales** (pas par équipe)
- ✅ Validation des incohérences
- ✅ Historique/logs des événements
- ✅ Statistiques: temps moyen, retards, taux respect
- ✅ Export CSV (période 1-7 jours)
- ✅ URL TV simple à copier
- ✅ Affichage TV plein écran (sans ID)
- ✅ Passage automatique au takt suivant
- ✅ **Bouton "Takt suivant" manuel** (overtime + auto-next désactivé)
- ✅ Sons industriels automobiles
- ✅ **Démarrage automatique en début de journée** (vérifié toutes les 30s)
- ✅ **Temps dépassé** affiché seulement si auto-next désactivé
- ✅ **IDs masqués** sur tous les écrans
- ✅ **Compte à rebours de pause** sur Dashboard ET écran TV
- ✅ **Reprise automatique après pause** fonctionnelle
- ✅ **Report automatique (carryover)** du temps non terminé au jour suivant
- ✅ **Synchronisation Dashboard/TV** (même intervalle de polling 5s)

## Prioritized Backlog

### P0 - Critical (Implémenté)
- [x] CRUD sites, lignes
- [x] Contrôles takt
- [x] Statistiques et export CSV
- [x] Horaires par équipe avec durée takt propre
- [x] Fuseau horaire par site
- [x] Démarrage automatique intelligent
- [x] Alertes sonores globales
- [x] Mode de déclenchement des pauses

### P1 - High Priority
- [ ] Gestion automatique des pauses programmées (déclenchement auto selon mode)
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
        └── Équipes (durée takt propre)
              └── Pauses (mode: immédiat / fin du takt)
        └── URL TV: /tv/{line_id}
```

## API Endpoints Clés
- `GET /api/server-time` - Heure serveur (UTC et Paris)
- `GET /api/sites` / `POST /api/sites` - CRUD sites avec timezone
- `GET /api/lines` / `PUT /api/lines/{id}` - CRUD lignes (estimated_takts calculé depuis équipe active)
- `GET /api/lines/{id}/auto-start-check` - Vérifie si auto-start nécessaire
- `POST /api/lines/{id}/auto-start` - Démarre avec le bon takt et temps
- `POST /api/lines/{id}/start` - Démarrer/reprendre
- `POST /api/lines/{id}/pause` - Suspendre
- `POST /api/lines/{id}/next` - Passer au takt suivant
- `GET /api/stats/{id}` - Statistiques

## Next Tasks
1. Implémenter le déclenchement automatique des pauses selon le mode configuré
2. Ajouter mode kiosque automatique pour écrans TV
3. Graphiques de tendances sur la page statistiques

## Technical Notes
- Fuseau horaire stocké au niveau du site (défaut: Europe/Paris)
- Durée du takt et estimated_takts calculés depuis l'équipe active (pas la ligne)
- `auto_start_at_day_begin=true` désactive le bouton Démarrer
- `auto_resume_after_takt=false` affiche le bouton "Takt suivant" en overtime
- `trigger_mode` des pauses: "immediate" ou "end_of_takt"
- `sound_alerts` au niveau global de la ligne (pas par équipe)
- IDs de ligne visibles uniquement dans les URLs (pas dans l'UI)
